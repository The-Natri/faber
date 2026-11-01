// Name-based chain matching (Phase 2a). A pattern matches when its words appear, in order and
// as whole words, in the lead name. Case, accents and punctuation are ignored, so "Domino's",
// "DOMINOS" and "Dominos Pizza" all match "Domino's", and "Lakme" matches "Lakmé Salon".

// The seed list from the brief (§8.2, 2a); Arcana can add or remove patterns later
export const SEED_CHAIN_PATTERNS = [
  'Starbucks', 'Chai Kings', 'Café Coffee Day', "Domino's", 'KFC', "McDonald's", 'Subway', 'Pizza Hut',
  'Burger King', 'Naturals', 'Green Trends', 'Lakmé Salon', 'Cult.fit', "Gold's Gym", 'Anytime Fitness',
  'Adyar Ananda Bhavan', 'A2B',
] as const;

// Lowercase, accents stripped, apostrophes dropped (Domino's → dominos), any other punctuation
// becomes a space (Cult.fit → cult fit), spaces collapsed
export function chainKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/['’‘`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// The first pattern that matches the name, or null
export function matchChain(name: string, patterns: readonly string[]): string | null {
  const haystack = ` ${chainKey(name)} `;
  for (const pattern of patterns) {
    const needle = chainKey(pattern);
    if (needle && haystack.includes(` ${needle} `)) return pattern;
  }
  return null;
}
