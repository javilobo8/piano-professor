import { PIANO_HIGH, PIANO_LOW } from '../song/parse';

export interface KeyRect {
  pitch: number;
  x: number;
  width: number;
  black: boolean;
}

export interface KeyboardLayout {
  low: number;
  high: number;
  /** Total width of the keyboard (CSS px). */
  width: number;
  whiteWidth: number;
  blackWidth: number;
  /** White keys first, then black keys (draw order). */
  keys: KeyRect[];
  byPitch: Map<number, KeyRect>;
}

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const BLACK_KEY_RATIO = 0.6;

export function isBlack(pitch: number): boolean {
  return BLACK_PITCH_CLASSES.has(((pitch % 12) + 12) % 12);
}

/**
 * Key range to show for a song: its lowest to highest pitch, widened to at
 * least `minSemitones`, inside the 88 keys, ending on white keys.
 */
export function songRange(pitches: Iterable<number>, minSemitones = 24): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const p of pitches) {
    low = Math.min(low, p);
    high = Math.max(high, p);
  }
  if (!Number.isFinite(low)) {
    low = 48;
    high = 72;
  }
  low = Math.max(PIANO_LOW, low);
  high = Math.min(PIANO_HIGH, high);
  while (high - low < minSemitones && (low > PIANO_LOW || high < PIANO_HIGH)) {
    if (low > PIANO_LOW) low--;
    if (high - low < minSemitones && high < PIANO_HIGH) high++;
  }
  if (isBlack(low)) low--;
  if (isBlack(high)) high++;
  return { low, high };
}

/** Positions every key from low to high (both white) across `width` pixels. */
export function layoutKeyboard(low: number, high: number, width: number): KeyboardLayout {
  let whiteCount = 0;
  for (let p = low; p <= high; p++) if (!isBlack(p)) whiteCount++;
  const whiteWidth = width / Math.max(1, whiteCount);
  const blackWidth = whiteWidth * BLACK_KEY_RATIO;

  const whites: KeyRect[] = [];
  const blacks: KeyRect[] = [];
  let whiteIndex = 0;
  for (let p = low; p <= high; p++) {
    if (isBlack(p)) {
      blacks.push({ pitch: p, x: whiteIndex * whiteWidth - blackWidth / 2, width: blackWidth, black: true });
    } else {
      whites.push({ pitch: p, x: whiteIndex * whiteWidth, width: whiteWidth, black: false });
      whiteIndex++;
    }
  }
  const keys = [...whites, ...blacks];
  return { low, high, width, whiteWidth, blackWidth, keys, byPitch: new Map(keys.map((k) => [k.pitch, k])) };
}

/** Key under an x position on the keyboard; black keys win in their upper part. */
export function keyAt(layout: KeyboardLayout, x: number, onBlackRow: boolean): number | null {
  if (onBlackRow) {
    for (let i = layout.keys.length - 1; i >= 0; i--) {
      const k = layout.keys[i];
      if (!k.black) break;
      if (x >= k.x && x < k.x + k.width) return k.pitch;
    }
  }
  for (const k of layout.keys) {
    if (!k.black && x >= k.x && x < k.x + k.width) return k.pitch;
  }
  return null;
}
