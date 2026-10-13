import type { Mode } from '../engine/types';
import type { AppDb, RunResult, ScoreRecord } from './db';
import type { HandChoice } from './settings';

const HISTORY_LIMIT = 10;

export function scoreKey(songId: string, hand: HandChoice, mode: Mode): string {
  return `${songId}|${hand}|${mode}`;
}

/** Stores a finished run; returns the updated record and whether it beat the previous best. */
export async function recordRun(
  db: AppDb,
  songId: string,
  hand: HandChoice,
  mode: Mode,
  result: RunResult,
): Promise<{ record: ScoreRecord; isNewBest: boolean }> {
  const key = scoreKey(songId, hand, mode);
  const tx = db.transaction('scores', 'readwrite');
  const existing = await tx.store.get(key);
  const isNewBest = !existing || result.percent > existing.best.percent;
  const record: ScoreRecord = {
    key,
    songId,
    hand,
    mode,
    best: isNewBest ? result : existing.best,
    history: [result, ...(existing?.history ?? [])].slice(0, HISTORY_LIMIT),
  };
  await tx.store.put(record);
  await tx.done;
  return { record, isNewBest };
}

export function getScores(db: AppDb, songId: string): Promise<ScoreRecord[]> {
  return db.getAllFromIndex('scores', 'bySong', songId);
}

export function getScore(db: AppDb, songId: string, hand: HandChoice, mode: Mode): Promise<ScoreRecord | undefined> {
  return db.get('scores', scoreKey(songId, hand, mode));
}
