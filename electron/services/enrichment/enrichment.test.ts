import { describe, expect, it } from 'vitest';
import { namesMatch, v1Score } from './index.ts';

describe('namesMatch', () => {
  it('never matches an empty or missing Google name (the v1 bug)', () => {
    expect(namesMatch('Cafe One', '')).toBe(false);
    expect(namesMatch('Cafe One', '   ')).toBe(false);
  });

  it('keeps the v1 fuzzy rules otherwise', () => {
    expect(namesMatch('Cafe One', 'Cafe One - Coffee & Snacks')).toBe(true);
    expect(namesMatch('Green Leaf Hotel', 'Green Leaf')).toBe(true);
    expect(namesMatch('Cafe One', 'Totally Different')).toBe(false);
  });
});

describe('v1Score', () => {
  it('matches the v1 formula', () => {
    expect(v1Score(null, null, false, false)).toBe(10);
    expect(v1Score(4.5, 230, true, true)).toBe(Math.round(36 + 20 + 20 + 10 + 10));
    expect(v1Score(4, 50, false, false)).toBe(Math.round(32 + 10 + 10));
  });
});
