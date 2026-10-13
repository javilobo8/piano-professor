import type { HandConfig, PlayableNote, Role, Song, TrackInfo } from './types';

export const DEFAULT_SPLIT_PITCH = 60;

const RIGHT_NAME = /right|\brh\b|derech|treble/i;
const LEFT_NAME = /left|\blh\b|izquierd|bass/i;

/** Guesses which track (or pitch range) belongs to each hand. */
export function autoHandConfig(song: Song): HandConfig {
  if (song.tracks.length < 2) {
    return { method: 'split', trackRoles: {}, splitPitch: DEFAULT_SPLIT_PITCH };
  }

  const namedRight = song.tracks.find((t) => RIGHT_NAME.test(t.name));
  const namedLeft = song.tracks.find((t) => LEFT_NAME.test(t.name) && !RIGHT_NAME.test(t.name));
  let right: TrackInfo;
  let left: TrackInfo;
  if (namedRight && namedLeft) {
    right = namedRight;
    left = namedLeft;
  } else {
    const [a, b] = [...song.tracks].sort((x, y) => y.noteCount - x.noteCount || x.index - y.index);
    [right, left] = a.avgPitch >= b.avgPitch ? [a, b] : [b, a];
  }

  const trackRoles: Record<number, Role> = {};
  for (const t of song.tracks) {
    trackRoles[t.index] = t === right ? 'right' : t === left ? 'left' : 'accompaniment';
  }
  return { method: 'tracks', trackRoles, splitPitch: DEFAULT_SPLIT_PITCH };
}

/** Gives every note its role; notes whose track is ignored are dropped. */
export function applyHandConfig(song: Song, config: HandConfig): PlayableNote[] {
  const out: PlayableNote[] = [];
  for (const n of song.notes) {
    const role: Role =
      config.method === 'split'
        ? n.pitch >= config.splitPitch
          ? 'right'
          : 'left'
        : (config.trackRoles[n.track] ?? 'accompaniment');
    if (role !== 'ignore') out.push({ ...n, role });
  }
  return out;
}
