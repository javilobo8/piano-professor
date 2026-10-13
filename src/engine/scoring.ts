import type { Score, TempoScore, WaitScore } from './types';

export function emptyWaitScore(totalSteps: number): WaitScore {
  return { kind: 'wait', totalSteps, completedSteps: 0, cleanSteps: 0, wrongNotes: 0, elapsedMs: 0 };
}

export function emptyTempoScore(): TempoScore {
  return { kind: 'tempo', hits: 0, perfects: 0, misses: 0, extras: 0, streak: 0, bestStreak: 0 };
}

/** Main percentage: clean steps (wait) or accuracy (tempo), rounded 0–100. */
export function scorePercent(score: Score): number {
  if (score.kind === 'wait') {
    return score.totalSteps === 0 ? 0 : Math.round((score.cleanSteps / score.totalSteps) * 100);
  }
  const total = score.hits + score.misses + score.extras;
  return total === 0 ? 0 : Math.round((score.hits / total) * 100);
}
