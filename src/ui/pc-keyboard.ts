// Desktop testing without a piano: the home row plays white keys, the row
// above plays black keys, Z / X shift the octave.

const KEY_OFFSETS: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
};

export const OCTAVE_DOWN_KEY = 'KeyZ';
export const OCTAVE_UP_KEY = 'KeyX';
export const DEFAULT_BASE_PITCH = 60;

/** Pitch for a KeyboardEvent.code with the home-row A on `basePitch`, or null. */
export function pcKeyToPitch(code: string, basePitch: number): number | null {
  const offset = KEY_OFFSETS[code];
  if (offset === undefined) return null;
  const pitch = basePitch + offset;
  return pitch >= 21 && pitch <= 108 ? pitch : null;
}

/** Moves the base by an octave, staying inside the piano. */
export function shiftOctave(basePitch: number, direction: -1 | 1): number {
  return Math.min(96, Math.max(24, basePitch + 12 * direction));
}
