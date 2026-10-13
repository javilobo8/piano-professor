import type { HandConfig } from '../song/types';
import type { AppDb, StoredSong } from './db';

export async function addSong(
  db: AppDb,
  input: { title: string; fileName: string; bytes: ArrayBuffer; duration: number },
): Promise<StoredSong> {
  const song: StoredSong = {
    id: crypto.randomUUID(),
    title: input.title,
    fileName: input.fileName,
    bytes: input.bytes,
    duration: input.duration,
    addedAt: Date.now(),
    handConfig: null,
  };
  await db.put('songs', song);
  return song;
}

/** All songs, alphabetically by title. */
export async function listSongs(db: AppDb): Promise<StoredSong[]> {
  const songs = await db.getAll('songs');
  return songs.sort((a, b) => a.title.localeCompare(b.title));
}

export function getSong(db: AppDb, id: string): Promise<StoredSong | undefined> {
  return db.get('songs', id);
}

export async function renameSong(db: AppDb, id: string, title: string): Promise<void> {
  const song = await db.get('songs', id);
  const trimmed = title.trim();
  if (!song || !trimmed) return;
  await db.put('songs', { ...song, title: trimmed });
}

export async function saveHandConfig(db: AppDb, id: string, handConfig: HandConfig): Promise<void> {
  const song = await db.get('songs', id);
  if (!song) return;
  await db.put('songs', { ...song, handConfig });
}

/** Deletes the song and all its scores in one transaction. */
export async function deleteSong(db: AppDb, id: string): Promise<void> {
  const tx = db.transaction(['songs', 'scores'], 'readwrite');
  const scores = tx.objectStore('scores');
  const keys = await scores.index('bySong').getAllKeys(id);
  await Promise.all([tx.objectStore('songs').delete(id), ...keys.map((k) => scores.delete(k)), tx.done]);
}
