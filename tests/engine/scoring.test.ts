import { describe, expect, it } from 'vitest';
import { emptyTempoScore, emptyWaitScore, scorePercent } from '../../src/engine/scoring';

describe('scorePercent', () => {
  it('is clean steps over total steps in wait mode', () => {
    expect(scorePercent({ ...emptyWaitScore(8), cleanSteps: 6 })).toBe(75);
    expect(scorePercent(emptyWaitScore(0))).toBe(0);
  });

  it('is hits over hits + misses + extras in tempo mode', () => {
    expect(scorePercent({ ...emptyTempoScore(), hits: 6, misses: 1, extras: 1 })).toBe(75);
    expect(scorePercent(emptyTempoScore())).toBe(0);
  });

  it('rounds to a whole number', () => {
    expect(scorePercent({ ...emptyWaitScore(3), cleanSteps: 2 })).toBe(67);
  });
});
