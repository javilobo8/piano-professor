import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Mode, Score } from '../engine/types';
import type { HandConfig } from '../song/types';
import type { HandChoice } from './settings';

export interface StoredSong {
  id: string;
  title: string;
  fileName: string;
  bytes: ArrayBuffer;
  addedAt: number;
  /** Seconds. */
  duration: number;
  /** null until the user confirms or changes the automatic assignment. */
  handConfig: HandConfig | null;
}

export interface RunResult {
  date: number;
  speed: number;
  percent: number;
  score: Score;
}

export interface ScoreRecord {
  /** `${songId}|${hand}|${mode}` */
  key: string;
  songId: string;
  hand: HandChoice;
  mode: Mode;
  best: RunResult;
  /** Most recent first, at most 10. */
  history: RunResult[];
}

interface Schema extends DBSchema {
  songs: { key: string; value: StoredSong };
  scores: { key: string; value: ScoreRecord; indexes: { bySong: string } };
}

export type AppDb = IDBPDatabase<Schema>;

export function openAppDb(name = 'piano-professor'): Promise<AppDb> {
  return openDB<Schema>(name, 1, {
    upgrade(db) {
      db.createObjectStore('songs', { keyPath: 'id' });
      const scores = db.createObjectStore('scores', { keyPath: 'key' });
      scores.createIndex('bySong', 'songId');
    },
  });
}
