import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyWaitScore } from '../../src/engine/scoring';
import { openAppDb, type RunResult } from '../../src/storage/db';
import { getScore, getScores, recordRun } from '../../src/storage/scores';
import { addSong, deleteSong, getSong, listSongs, renameSong, saveHandConfig } from '../../src/storage/songs';

let dbCounter = 0;
const freshDb = () => openAppDb(`test-${dbCounter++}`);
const bytes = () => Uint8Array.from([1, 2, 3]).buffer;
const run = (percent: number, date = 1): RunResult => ({ date, speed: 1, percent, score: emptyWaitScore(4) });

describe('songs', () => {
  it('adds, lists alphabetically and reads back songs with their bytes', async () => {
    const db = await freshDb();
    await addSong(db, { title: 'Zeta', fileName: 'z.mid', bytes: bytes(), duration: 10 });
    const a = await addSong(db, { title: 'Alpha', fileName: 'a.mid', bytes: bytes(), duration: 5 });
    expect((await listSongs(db)).map((s) => s.title)).toEqual(['Alpha', 'Zeta']);
    const stored = await getSong(db, a.id);
    expect(stored).toMatchObject({ title: 'Alpha', fileName: 'a.mid', duration: 5, handConfig: null });
    expect(new Uint8Array(stored!.bytes)).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('renames (ignoring blank names) and saves hand configs', async () => {
    const db = await freshDb();
    const s = await addSong(db, { title: 'Old', fileName: 'o.mid', bytes: bytes(), duration: 1 });
    await renameSong(db, s.id, '  New  ');
    await renameSong(db, s.id, '   ');
    await saveHandConfig(db, s.id, { method: 'split', trackRoles: {}, splitPitch: 55 });
    expect(await getSong(db, s.id)).toMatchObject({
      title: 'New',
      handConfig: { method: 'split', splitPitch: 55 },
    });
  });

  it('deleting a song deletes its scores', async () => {
    const db = await freshDb();
    const s = await addSong(db, { title: 'A', fileName: 'a.mid', bytes: bytes(), duration: 1 });
    const keep = await addSong(db, { title: 'B', fileName: 'b.mid', bytes: bytes(), duration: 1 });
    await recordRun(db, s.id, 'right', 'wait', run(50));
    await recordRun(db, keep.id, 'right', 'wait', run(70));
    await deleteSong(db, s.id);
    expect(await getSong(db, s.id)).toBeUndefined();
    expect(await getScores(db, s.id)).toEqual([]);
    expect(await getScores(db, keep.id)).toHaveLength(1);
  });
});

describe('scores', () => {
  it('keeps the best run and the last 10 runs per song, hand and mode', async () => {
    const db = await freshDb();
    const first = await recordRun(db, 's', 'left', 'tempo', run(60, 1));
    expect(first.isNewBest).toBe(true);
    const worse = await recordRun(db, 's', 'left', 'tempo', run(40, 2));
    expect(worse.isNewBest).toBe(false);
    expect(worse.record.best.percent).toBe(60);
    for (let i = 3; i <= 12; i++) await recordRun(db, 's', 'left', 'tempo', run(10, i));
    const record = await getScore(db, 's', 'left', 'tempo');
    expect(record!.history).toHaveLength(10);
    expect(record!.history[0].date).toBe(12);
    expect(await getScore(db, 's', 'right', 'tempo')).toBeUndefined();
  });
});
