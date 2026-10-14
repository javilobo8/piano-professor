import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '../../src/storage/db';
import { latestPractice } from '../../src/ui/latest-practice';

const SCORE = { kind: 'wait', totalSteps: 10, completedSteps: 10, cleanSteps: 8, wrongNotes: 2, elapsedMs: 1000 } as const;
const NO_RUN = { date: 0, speed: 1, percent: 0, score: SCORE };

function record(songId: string, hand: 'right' | 'left' | 'both', dates: number[]): ScoreRecord {
  const runs = dates.map((date) => ({ date, speed: 1, percent: 80, score: SCORE }));
  return { key: `${songId}|${hand}|wait`, songId, hand, mode: 'wait', best: runs[0] ?? NO_RUN, history: runs };
}

describe('latestPractice', () => {
  it('is null without records or runs', () => {
    expect(latestPractice([])).toBeNull();
    expect(latestPractice([record('a', 'right', [])])).toBeNull();
  });

  it('picks the record whose most recent run is the latest', () => {
    const records = [record('a', 'right', [300, 100]), record('b', 'left', [500]), record('a', 'both', [400])];
    expect(latestPractice(records)?.key).toBe('b|left|wait');
  });

  it('ignores a record without runs that comes after one with runs', () => {
    const records = [record('a', 'right', [300]), record('b', 'left', [])];
    expect(latestPractice(records)?.key).toBe('a|right|wait');
  });

  it('keeps the first record when two latest runs share a date', () => {
    const records = [record('a', 'right', [300]), record('b', 'left', [300])];
    expect(latestPractice(records)?.key).toBe('a|right|wait');
  });
});
