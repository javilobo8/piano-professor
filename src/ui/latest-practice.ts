import type { ScoreRecord } from '../storage/db';

/** The score record with the most recent run, for "keep practising"; null if nothing was ever played. */
export function latestPractice(records: readonly ScoreRecord[]): ScoreRecord | null {
  let latest: ScoreRecord | null = null;
  for (const record of records) {
    const date = record.history[0]?.date;
    if (date === undefined) continue;
    if (!latest || date > latest.history[0].date) latest = record;
  }
  return latest;
}
