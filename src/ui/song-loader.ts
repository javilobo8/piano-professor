import { autoHandConfig } from '../song/hands';
import { parseSong } from '../song/parse';
import type { HandConfig, Song } from '../song/types';
import type { StoredSong } from '../storage/db';
import { getSong } from '../storage/songs';
import { getDb } from './app-state';

export interface LoadedSong {
  stored: StoredSong;
  song: Song;
  handConfig: HandConfig;
}

/** Reads a song from the library and parses it; null if it is gone or unreadable. */
export async function loadSong(songId: string): Promise<LoadedSong | null> {
  const stored = await getSong(await getDb(), songId);
  if (!stored) return null;
  try {
    const song = parseSong(stored.bytes, stored.fileName);
    song.title = stored.title;
    return { stored, song, handConfig: stored.handConfig ?? autoHandConfig(song) };
  } catch {
    return null;
  }
}
