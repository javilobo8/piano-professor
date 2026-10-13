import { describe, expect, it } from 'vitest';
import { lowerBound } from '../../src/util/bisect';

describe('lowerBound', () => {
  const items = [0, 1, 1, 2, 5].map((start) => ({ start }));

  it('returns the first index whose start is >= value', () => {
    expect(lowerBound(items, -1)).toBe(0);
    expect(lowerBound(items, 1)).toBe(1);
    expect(lowerBound(items, 1.5)).toBe(3);
    expect(lowerBound(items, 5)).toBe(4);
    expect(lowerBound(items, 6)).toBe(5);
  });

  it('handles an empty list', () => {
    expect(lowerBound([], 3)).toBe(0);
  });
});
