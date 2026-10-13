export type Role = 'right' | 'left' | 'accompaniment' | 'ignore';
export type PlayRole = Exclude<Role, 'ignore'>;

export interface SongNote {
  /** Index of the note in `Song.notes`. */
  id: number;
  /** MIDI pitch, 21 (A0) to 108 (C8). */
  pitch: number;
  /** Start in song seconds. */
  start: number;
  /** End in song seconds (>= start). */
  end: number;
  /** 0–1. */
  velocity: number;
  /** Index into `Song.tracks`. */
  track: number;
}

export interface TrackInfo {
  index: number;
  name: string;
  channel: number;
  noteCount: number;
  avgPitch: number;
}

export interface Song {
  title: string;
  /** End of the last note, in seconds. */
  duration: number;
  /** Sorted by start, then pitch. */
  notes: SongNote[];
  /** Only tracks with playable notes, indexed 0..n-1. */
  tracks: TrackInfo[];
  /**
   * Measure boundaries in seconds: measures[0] = 0, measure i spans
   * [measures[i], measures[i + 1]), and the last value is >= duration.
   * Always has at least 2 entries.
   */
  measures: number[];
}

export interface HandConfig {
  method: 'tracks' | 'split';
  /** Used when method is 'tracks'. Missing tracks count as accompaniment. */
  trackRoles: Record<number, Role>;
  /** Used when method is 'split': pitch >= splitPitch is right hand. */
  splitPitch: number;
}

export interface PlayableNote extends SongNote {
  role: PlayRole;
}
