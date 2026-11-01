import { describe, expect, it } from 'vitest';
import { chainKey, matchChain, SEED_CHAIN_PATTERNS } from './chain.ts';

const match = (name: string) => matchChain(name, SEED_CHAIN_PATTERNS);

describe('chainKey', () => {
  it('folds case, accents and punctuation', () => {
    expect(chainKey("Domino's")).toBe('dominos');
    expect(chainKey('Lakmé Salon')).toBe('lakme salon');
    expect(chainKey('Cult.fit')).toBe('cult fit');
    expect(chainKey('  Café   Coffee-Day ')).toBe('cafe coffee day');
    expect(chainKey('McDonald’s')).toBe('mcdonalds');
  });
});

describe('matchChain', () => {
  it('matches seed chains whatever the case, accents or punctuation', () => {
    expect(match('Starbucks Coffee')).toBe('Starbucks');
    expect(match('DOMINOS PIZZA')).toBe("Domino's");
    expect(match("Domino's Pizza - RS Puram")).toBe("Domino's");
    expect(match('Cafe Coffee Day')).toBe('Café Coffee Day');
    expect(match('Lakme Salon Peelamedu')).toBe('Lakmé Salon');
    expect(match('cult fit gym')).toBe('Cult.fit');
    expect(match('A2B - Adyar Ananda Bhavan')).toBe('Adyar Ananda Bhavan');
    expect(match('A2B Veg Restaurant')).toBe('A2B');
    expect(match("McDonald’s")).toBe("McDonald's");
  });

  it('only matches whole words', () => {
    expect(match('Subways Tea Stall')).toBeNull();
    expect(match('KFCafe')).toBeNull();
    expect(match('Supernaturals Spa')).toBeNull();
    expect(match('Chai Kingdom')).toBeNull();
    expect(match('Coffee Day Bakery')).toBeNull();
  });

  it('ignores names with no match and empty patterns', () => {
    expect(match('Corner Cafe')).toBeNull();
    expect(matchChain('Anything', ['', '  '])).toBeNull();
    expect(matchChain('', SEED_CHAIN_PATTERNS)).toBeNull();
  });
});
