// One canonical spelling per city, whatever the case, spacing or script it arrived in.
// OSM data mixes "Coimbatore", "coimbatore" and the Tamil-script name.
const CANONICAL: Record<string, string> = {
  coimbatore: 'Coimbatore',
  'கோயம்புத்தூர்': 'Coimbatore',
  chennai: 'Chennai',
  'சென்னை': 'Chennai',
};

// Localities OSM sometimes puts in addr:city. The lead gets the city; the locality stays in
// the address (see placeCity).
const LOCALITIES: Record<string, string> = {
  peelamedu: 'Coimbatore',
  masakalipalayam: 'Coimbatore',
};

const tidy = (city: string) => city.normalize('NFC').trim().replace(/\s+/g, ' ');
const key = (city: string) => tidy(city).toLocaleLowerCase('en');

export function normalizeCity(city: string | null | undefined): string | null {
  if (city == null) return null;
  const trimmed = tidy(city);
  if (!trimmed) return null;
  return CANONICAL[key(trimmed)] ?? LOCALITIES[key(trimmed)] ?? trimmed;
}

// City plus address for a new lead: a locality given as the city is folded into its city and
// appended to the address when the address doesn't already mention it.
export function placeCity(city: string | null | undefined, address: string | null | undefined): { city: string | null; address: string | null } {
  const normalized = normalizeCity(city);
  if (city == null || !LOCALITIES[key(city)]) return { city: normalized, address: address ?? null };
  const locality = tidy(city);
  const addr = address?.trim() || null;
  if (addr && addr.toLocaleLowerCase('en').includes(locality.toLocaleLowerCase('en'))) return { city: normalized, address: addr };
  return { city: normalized, address: addr ? `${addr}, ${locality}` : locality };
}
