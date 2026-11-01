import type Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import { log } from '../logger/index.ts';
import { upsertLead } from '../leads/index.ts';
import type { DiscoveryResult, DiscoveryState } from '../../../shared/types.ts';

// The v1 OSM pipeline, unchanged: Nominatim geocode, then one Overpass query per category
// against four mirrors (French first), 15 s per attempt, one 10 s backoff retry, 5 s between categories.

const USER_AGENT = 'NatrisFaber/1.0';
const OVERPASS_ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const ATTEMPT_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 10_000;
const BETWEEN_CATEGORIES_MS = 5_000;
const MAX_LOG_LINES = 500;
const MAX_POINTS = 3000;

const CATEGORY_QUERIES: Record<string, string> = {
  'Restaurants': `nwr["amenity"="restaurant"][!"website"](around:{radius},{lat},{lon});`,
  'Cafes': `nwr["amenity"="cafe"][!"website"](around:{radius},{lat},{lon});`,
  'Salons': `nwr["shop"="beauty"][!"website"](around:{radius},{lat},{lon});
           nwr["shop"="hairdresser"][!"website"](around:{radius},{lat},{lon});`,
  'Gyms': `nwr["leisure"="fitness_centre"][!"website"](around:{radius},{lat},{lon});`,
  'Clinics': `nwr["amenity"="clinic"][!"website"](around:{radius},{lat},{lon});
            nwr["healthcare"="clinic"][!"website"](around:{radius},{lat},{lon});`,
  'Boutiques': `nwr["shop"="clothes"][!"website"](around:{radius},{lat},{lon});`,
  'Coaching Centres': `nwr["amenity"="tutoring"][!"website"](around:{radius},{lat},{lon});`,
  'Hotels': `nwr["tourism"="hotel"][!"website"](around:{radius},{lat},{lon});`,
};

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function geocode(location: string): Promise<{ lat: number; lon: number; displayName: string }> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new AppError('UNAVAILABLE', `Geocoding failed: HTTP ${res.status}`);
  const data = await res.json() as { lat: string; lon: string; display_name: string }[];
  if (!data || data.length === 0) throw new AppError('NOT_FOUND', `Location "${location}" not found`);
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), displayName: data[0].display_name };
}

export interface DiscoveryHooks {
  onLog: (line: string) => void;
  onState: (state: DiscoveryState) => void;
  onFinished: (result: DiscoveryResult) => void;
}

export class DiscoveryRunner {
  private state: DiscoveryState = { running: false, logs: [], stats: { found: 0, saved: 0, updated: 0 }, center: null, points: [] };

  constructor(private readonly getDb: () => Database.Database, private readonly hooks: DiscoveryHooks) {}

  getState(): DiscoveryState {
    return this.state;
  }

  private sendLog(line: string) {
    this.state = { ...this.state, logs: [...this.state.logs, line].slice(-MAX_LOG_LINES) };
    this.hooks.onLog(line);
  }

  private setState(patch: Partial<DiscoveryState>) {
    this.state = { ...this.state, ...patch };
    this.hooks.onState(this.state);
  }

  private async fetchOverpass(query: string): Promise<OverpassElement[]> {
    for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
      const endpoint = OVERPASS_ENDPOINTS[i];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
      try {
        if (i > 0) this.sendLog(`⚠️ Mirror timeout/error. Trying alternative endpoint (${i + 1}/${OVERPASS_ENDPOINTS.length})...`);
        const res = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`Overpass API returned status ${res.status}`);
        const data = await res.json() as { elements?: OverpassElement[] };
        return data.elements || [];
      } catch (err) {
        clearTimeout(timeout);
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`[Discovery] Endpoint ${endpoint} failed: ${message}`);
        if (i === OVERPASS_ENDPOINTS.length - 1) throw new Error(`All Overpass API mirrors failed. Last error: ${message}`);
      }
    }
    return [];
  }

  private async runCategoryQuery(category: string, query: string): Promise<OverpassElement[]> {
    try {
      return await this.fetchOverpass(query);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();
      const retryable = ['429', '504', 'fetch failed', 'network', 'timeout', 'aborted', 'econnreset', 'enotfound', 'all overpass api mirrors failed']
        .some((needle) => lower.includes(needle));
      if (!retryable) throw err;
      this.sendLog(`⏳ ${category} failed (${message}), retrying in 10s...`);
      await sleep(RETRY_DELAY_MS);
      return this.fetchOverpass(query);
    }
  }

  async run(location: string, radiusKm: number, categories: string[]): Promise<DiscoveryResult> {
    if (this.state.running) throw new AppError('CONFLICT', 'A discovery run is already in progress');
    this.state = { running: false, logs: [], stats: { found: 0, saved: 0, updated: 0 }, center: null, points: [] };
    this.setState({ running: true });

    let saved = 0;
    let updated = 0;
    let skipped = 0;
    let found = 0;
    const errors: string[] = [];

    try {
      this.sendLog(`🌍 Geocoding "${location}"...`);
      const place = await geocode(location);
      this.sendLog(`✅ Found: ${place.displayName} (${place.lat.toFixed(4)}, ${place.lon.toFixed(4)})`);
      this.setState({ center: { lat: place.lat, lon: place.lon, radiusKm } });
      const radiusMeters = radiusKm * 1000;

      for (const category of categories) {
        const template = CATEGORY_QUERIES[category];
        if (!template) {
          this.sendLog(`⚠️ Warning: Category "${category}" not recognized. Skipping.`);
          continue;
        }

        try {
          this.sendLog(`🔍 Querying OSM for ${category.toLowerCase()} within ${radiusKm}km...`);
          const lines = template
            .replace(/{radius}/g, String(radiusMeters))
            .replace(/{lat}/g, String(place.lat))
            .replace(/{lon}/g, String(place.lon));
          const elements = await this.runCategoryQuery(category, `[out:json];\n(\n  ${lines}\n);\nout center;`);

          this.sendLog(`📦 ${elements.length} results found for ${category.toLowerCase()}`);
          found += elements.length;

          if (elements.length > 0) {
            this.sendLog('💾 Saving to database...');
            let catSaved = 0;
            let catUpdated = 0;
            let catSkipped = 0;
            const db = this.getDb();
            const catPoints: { lat: number; lon: number }[] = [];

            for (const el of elements) {
              const tags = el.tags || {};
              if (!tags.name || tags.website) {
                catSkipped++;
                continue;
              }
              const phone = tags.phone || tags['contact:phone'] || null;
              const street = tags['addr:street'] || '';
              const cityTag = tags['addr:city'] || '';
              const address = street ? (cityTag ? `${street}, ${cityTag}` : street) : (cityTag || null);
              const leadLat = el.lat ?? el.center?.lat ?? place.lat;
              const leadLon = el.lon ?? el.center?.lon ?? place.lon;
              const result = upsertLead(db, {
                osm_id: `${el.type}/${el.id}`,
                name: tags.name,
                category,
                source: 'osm',
                phone,
                address,
                city: cityTag || location.split(',')[0].trim(),
                lat: leadLat,
                lon: leadLon,
                rating: tags.rating ? parseFloat(tags.rating) : null,
              });
              catPoints.push({ lat: leadLat, lon: leadLon });
              if (result === 'inserted') catSaved++;
              else catUpdated++;
            }

            saved += catSaved;
            updated += catUpdated;
            skipped += catSkipped;
            this.sendLog(`✅ ${catSaved} new, ${catUpdated} updated, ${catSkipped} skipped`);
            this.setState({ stats: { found, saved, updated }, points: [...this.state.points, ...catPoints].slice(0, MAX_POINTS) });
          }
        } catch (catErr) {
          const message = `Error running scraper for "${category}": ${catErr instanceof Error ? catErr.message : String(catErr)}`;
          log.error(`[Discovery] ${message}`);
          errors.push(message);
          this.sendLog(`❌ ${message}`);
        }

        await sleep(BETWEEN_CATEGORIES_MS);
      }

      this.sendLog(`🎉 Discovery complete — ${saved} leads saved, ${updated} updated, ${skipped} skipped`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`[Discovery] Critical failure: ${message}`);
      errors.push(message);
      this.sendLog(`❌ Critical error: ${message}`);
    }

    const result: DiscoveryResult = { found, saved, updated, errors };
    this.setState({ running: false, stats: { found, saved, updated } });
    this.hooks.onFinished(result);
    return result;
  }
}
