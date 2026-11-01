import type Database from 'better-sqlite3';
import { chromium, type Browser } from 'playwright';
import { AppError } from '../../ipc/core.ts';
import { log } from '../logger/index.ts';
import { pendingEnrichmentBatch } from '../leads/index.ts';
import type { EnrichmentComplete, EnrichmentOutcome, EnrichmentState, EnrichmentStep, Lead } from '../../../shared/types.ts';

// Google Maps enrichment with Playwright (v1 selectors and scoring). The browser is the
// installed Microsoft Edge; Playwright's own Chromium is the fallback.

const BATCH_SIZE = 20;
const MAX_LOG_LINES = 500;
const RECENT_MAX = 10;

export const NO_BROWSER_MESSAGE =
  'No browser found for enrichment. Install Microsoft Edge, or run "npx playwright install chromium".';

export async function launchBrowser(onLog: (line: string) => void): Promise<Browser> {
  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    onLog('🌐 Using Microsoft Edge');
    return browser;
  } catch (edgeErr) {
    log.warn(`[Enrichment] Edge launch failed: ${edgeErr instanceof Error ? edgeErr.message : String(edgeErr)}`);
  }
  try {
    const browser = await chromium.launch({ headless: true });
    onLog('🌐 Edge not found — using Playwright Chromium');
    return browser;
  } catch (chromiumErr) {
    log.warn(`[Enrichment] Chromium launch failed: ${chromiumErr instanceof Error ? chromiumErr.message : String(chromiumErr)}`);
    throw new AppError('UNAVAILABLE', NO_BROWSER_MESSAGE);
  }
}

// v1 fuzzy match, except that an empty or missing Google name never counts as a match
export function namesMatch(osmName: string, googleName: string): boolean {
  const google = googleName.trim().toLowerCase();
  if (!google) return false;
  const osm = osmName.toLowerCase();
  return google.includes(osm) || osm.includes(google.split(' ')[0]);
}

// v1 scoring, unchanged until scoring v2 (Phase 4)
export function v1Score(rating: number | null, reviewCount: number | null, hasPhone: boolean, hasSocial: boolean): number {
  const ratingScore = rating ? (rating / 5) * 40 : 0;
  const reviewScore = reviewCount ? Math.min(reviewCount, 100) * 0.2 : 0;
  const websiteScore = 10;
  return Math.round(ratingScore + reviewScore + (hasPhone ? 20 : 0) + (hasSocial ? 10 : 0) + websiteScore);
}

export interface EnrichmentHooks {
  onLog: (line: string) => void;
  onCaptcha: (leadName: string) => void;
  onState: (state: EnrichmentState) => void;
  onComplete: (result: EnrichmentComplete) => void;
}

export class EnrichmentRunner {
  private state: EnrichmentState = {
    running: false, logs: [], captchaPending: false, processed: 0, total: 0, stats: { enriched: 0, skipped: 0 }, error: null,
    current: null, step: null, recent: [],
  };
  private stopRequested = false;
  private captchaResolver: ((action: 'retry' | 'skip') => void) | null = null;

  constructor(private readonly getDb: () => Database.Database, private readonly hooks: EnrichmentHooks) {}

  getState(): EnrichmentState {
    return this.state;
  }

  private sendLog(line: string) {
    this.state = { ...this.state, logs: [...this.state.logs, line].slice(-MAX_LOG_LINES) };
    this.hooks.onLog(line);
  }

  private setState(patch: Partial<EnrichmentState>) {
    this.state = { ...this.state, ...patch };
    this.hooks.onState(this.state);
  }

  private setStep(step: EnrichmentStep) {
    this.setState({ step });
  }

  private record(lead: Lead, outcome: EnrichmentOutcome) {
    const entry = { lead_id: lead.id, name: lead.name, outcome, at: new Date().toISOString() };
    this.setState({ recent: [entry, ...this.state.recent].slice(0, RECENT_MAX) });
  }

  stop() {
    this.stopRequested = true;
  }

  resolveCaptcha(action: 'retry' | 'skip') {
    if (!this.captchaResolver) return;
    this.captchaResolver(action);
    this.captchaResolver = null;
    this.setState({ captchaPending: false });
  }

  // Starts a batch in the background; progress arrives as events
  start() {
    if (this.state.running) throw new AppError('CONFLICT', 'Enrichment is already running');
    const leads = pendingEnrichmentBatch(this.getDb(), BATCH_SIZE);
    this.stopRequested = false;
    this.setState({ running: true, error: null, processed: 0, total: leads.length, captchaPending: false });
    this.sendLog('🚀 Starting Playwright Google Maps lead enrichment...');
    if (leads.length === 0) {
      this.sendLog('✅ No pending leads to enrich');
      this.finish({ enriched: 0, skipped: 0 });
      return;
    }
    void this.runBatch(leads);
  }

  private finish(result: EnrichmentComplete) {
    this.setState({
      running: false,
      captchaPending: false,
      current: null,
      step: null,
      error: result.error ?? null,
      stats: { enriched: this.state.stats.enriched + result.enriched, skipped: this.state.stats.skipped + result.skipped },
    });
    this.hooks.onComplete(result);
  }

  private async runBatch(leads: Lead[]) {
    let enriched = 0;
    let skipped = 0;
    let browser: Browser | null = null;
    const db = this.getDb();
    const markStatus = (id: number, status: 'failed' | 'review') =>
      db.prepare(`UPDATE leads SET enrichment_status = ?, last_updated = datetime('now') WHERE id = ?`).run(status, id);

    try {
      browser = await launchBrowser((line) => this.sendLog(line));
      const page = await browser.newPage();

      for (const lead of leads) {
        if (this.stopRequested) {
          this.sendLog('⏹ Enrichment stopped by user');
          break;
        }
        this.sendLog(`🔍 Enriching: ${lead.name} (${lead.city || 'unknown city'})...`);
        this.setState({ current: { id: lead.id, name: lead.name }, step: 'search' });

        try {
          const query = encodeURIComponent(`${lead.name} ${lead.city || ''}`);
          const url = `https://www.google.com/maps/search/${query}`;
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          const isCaptcha = (await page.$('form#captcha-form')) !== null || (await page.$('iframe[src*="recaptcha"]')) !== null;
          if (isCaptcha) {
            this.sendLog(`⚠️ CAPTCHA detected on ${lead.name} — waiting for user action...`);
            this.setState({ captchaPending: true });
            this.hooks.onCaptcha(lead.name);
            const action = await new Promise<'retry' | 'skip'>((resolve) => { this.captchaResolver = resolve; });
            if (action === 'skip') {
              this.sendLog(`⏭ Skipped: ${lead.name}`);
              this.record(lead, 'skipped');
              skipped++;
              continue;
            }
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);
          }

          const firstResult = await page.$('.Nv2PK');
          if (!firstResult) {
            this.sendLog(`❌ No results found for: ${lead.name}`);
            markStatus(lead.id, 'failed');
            this.record(lead, 'failed');
            skipped++;
            continue;
          }
          await firstResult.click();
          await page.waitForTimeout(2000);
          this.setStep('rating');

          let rating: number | null = null;
          for (const sel of ['div.F7nice span[aria-hidden="true"]', 'span.ceNzKf span[aria-hidden="true"]', 'div.fontDisplayLarge', 'span[aria-label*="stars"]']) {
            const el = await page.$(sel);
            if (!el) continue;
            const parsed = parseFloat((await el.textContent())?.trim() ?? '');
            if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
              rating = parsed;
              break;
            }
          }
          if (!rating) {
            const match = (await page.content()).match(/"aggregateRating"[^}]*"ratingValue"\s*:\s*"?([\d.]+)"?/);
            if (match) rating = parseFloat(match[1]);
          }

          let reviewCount: number | null = null;
          for (const sel of ['div.F7nice span[aria-label*="review"]', 'span[aria-label*="reviews"]', 'button[jsaction*="pane.rating"]']) {
            const el = await page.$(sel);
            if (!el) continue;
            const label = (await el.getAttribute('aria-label')) || (await el.textContent()) || '';
            const parsed = parseInt(label.replace(/[^0-9]/g, ''));
            if (!isNaN(parsed) && parsed > 0) {
              reviewCount = parsed;
              break;
            }
          }
          if (!reviewCount) {
            const match = (await page.content()).match(/"reviewCount"\s*:\s*"?([\d]+)"?/);
            if (match) reviewCount = parseInt(match[1]);
          }

          this.setStep('social');
          const content = await page.content();
          const instagram = content.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
          const facebook = content.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
          const socialLinks: string[] = [];
          if (instagram) socialLinks.push(`https://instagram.com/${instagram[1]}`);
          if (facebook) socialLinks.push(`https://facebook.com/${facebook[1]}`);

          this.setStep('match');
          const nameEl = await page.$('h1.DUwDvf');
          const googleName = nameEl ? (await nameEl.textContent()) || '' : '';
          if (!namesMatch(lead.name, googleName)) {
            this.sendLog(googleName.trim()
              ? `⚠️ Name mismatch for ${lead.name} — flagged for review`
              : `⚠️ Couldn't read the Google name for ${lead.name} — flagged for review`);
            markStatus(lead.id, 'review');
            this.record(lead, 'review');
            skipped++;
            continue;
          }

          const hasSocial = socialLinks.length > 0;
          const score = v1Score(rating, reviewCount, lead.has_phone === 1, hasSocial);
          db.prepare(`
            UPDATE leads SET rating = ?, review_count = ?, social_links = ?, has_social = ?, score = ?,
                             enrichment_status = 'enriched', enriched_at = datetime('now'), last_updated = datetime('now')
            WHERE id = ?
          `).run(rating, reviewCount, JSON.stringify(socialLinks), hasSocial ? 1 : 0, score, lead.id);

          this.sendLog(`✅ ${lead.name} — Rating: ${rating ?? 'N/A'}, Reviews: ${reviewCount ?? 'N/A'}, Score: ${score}`);
          this.record(lead, 'enriched');
          enriched++;
        } catch (err) {
          this.sendLog(`❌ Error enriching ${lead.name}: ${err instanceof Error ? err.message : String(err)}`);
          markStatus(lead.id, 'failed');
          this.record(lead, 'failed');
          skipped++;
        } finally {
          this.setState({ processed: this.state.processed + 1 });
        }

        await page.waitForTimeout(2000 + Math.random() * 3000);
      }
      this.finish({ enriched, skipped });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendLog(`❌ ${message}`);
      this.finish({ enriched, skipped, error: message });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
}
