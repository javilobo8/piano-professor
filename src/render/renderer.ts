import type { KeyResult } from '../engine/types';
import type { PlayableNote, PlayRole } from '../song/types';
import { lowerBound } from '../util/bisect';
import { COLORS } from './colors';
import type { KeyboardLayout } from './keyboard-layout';

/** Song seconds visible above the keyboard. */
export const VISIBLE_SECONDS = 3;

export interface FrameInput {
  /** CSS pixels. */
  width: number;
  height: number;
  layout: KeyboardLayout;
  notes: readonly PlayableNote[];
  /** Longest note duration in `notes` (to find notes that started off-screen). */
  maxDuration: number;
  songTime: number;
  /** Roles the player is practising; other notes are drawn faded. Empty = none faded. */
  practiced: ReadonlySet<PlayRole>;
  showAccompaniment: boolean;
  pressed: ReadonlyMap<number, KeyResult>;
  expected: ReadonlySet<number>;
  measures: readonly number[];
  loop: { start: number; end: number } | null;
  /** Returns the label drawn inside falling notes, or null for no labels. */
  noteLabel: ((pitch: number) => string) | null;
}

export interface Geometry {
  keyboardTop: number;
  keyboardHeight: number;
  pxPerSecond: number;
}

export function geometry(width: number, height: number, whiteWidth: number): Geometry {
  const keyboardHeight = Math.round(Math.min(height * 0.26, Math.max(height * 0.14, whiteWidth * 5)));
  const keyboardTop = height - keyboardHeight;
  return { keyboardTop, keyboardHeight, pxPerSecond: keyboardTop / VISIBLE_SECONDS };
}

/** Index range [from, to) of notes visible at songTime. */
export function visibleRange(notes: readonly PlayableNote[], songTime: number, maxDuration: number): [number, number] {
  return [lowerBound(notes, songTime - maxDuration), lowerBound(notes, songTime + VISIBLE_SECONDS + 0.001)];
}

export function maxNoteDuration(notes: readonly PlayableNote[]): number {
  return notes.reduce((max, n) => Math.max(max, n.end - n.start), 0);
}

function noteColor(note: PlayableNote, black: boolean): string {
  if (note.role === 'accompaniment') return COLORS.accompaniment;
  if (note.role === 'left') return black ? COLORS.leftDark : COLORS.left;
  return black ? COLORS.rightDark : COLORS.right;
}

function keyColor(result: KeyResult): string {
  switch (result) {
    case 'right':
      return COLORS.right;
    case 'left':
      return COLORS.left;
    case 'wrong':
      return COLORS.wrong;
    case 'neutral':
      return COLORS.neutral;
  }
}

export function drawFrame(ctx: CanvasRenderingContext2D, input: FrameInput): void {
  const { width, height, layout, songTime } = input;
  const g = geometry(width, height, layout.whiteWidth);
  const yOf = (t: number) => g.keyboardTop - (t - songTime) * g.pxPerSecond;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Darker lanes under black keys.
  ctx.fillStyle = COLORS.blackLane;
  for (const k of layout.keys) if (k.black) ctx.fillRect(k.x, 0, k.width, g.keyboardTop);

  if (input.loop) {
    const top = Math.max(0, yOf(input.loop.end));
    const bottom = Math.min(g.keyboardTop, yOf(input.loop.start));
    if (bottom > top) {
      ctx.fillStyle = COLORS.loopShade;
      ctx.fillRect(0, top, width, bottom - top);
    }
  }

  ctx.fillStyle = COLORS.measureLine;
  for (const m of input.measures) {
    const y = yOf(m);
    if (y >= 0 && y <= g.keyboardTop) ctx.fillRect(0, Math.round(y), width, 1);
  }

  const [from, to] = visibleRange(input.notes, songTime, input.maxDuration);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = `600 ${Math.max(9, Math.min(13, layout.whiteWidth * 0.45))}px system-ui, sans-serif`;
  for (let i = from; i < to; i++) {
    const n = input.notes[i];
    if (n.end < songTime) continue;
    if (n.role === 'accompaniment' && !input.showAccompaniment) continue;
    const key = layout.byPitch.get(n.pitch);
    if (!key) continue;
    const top = yOf(n.end);
    const bottom = yOf(n.start);
    const h = Math.max(4, bottom - top);
    const faded = n.role === 'accompaniment' || (input.practiced.size > 0 && !input.practiced.has(n.role));
    ctx.globalAlpha = n.role === 'accompaniment' ? 0.45 : faded ? 0.35 : 1;
    ctx.fillStyle = noteColor(n, key.black);
    ctx.beginPath();
    ctx.roundRect(key.x + 1, bottom - h, key.width - 2, h, Math.min(5, key.width / 3));
    ctx.fill();
    if (input.noteLabel && !faded && h >= 16 && key.width >= 12) {
      ctx.fillStyle = COLORS.label;
      ctx.fillText(input.noteLabel(n.pitch), key.x + key.width / 2, bottom - 3);
    }
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.hitLine;
  ctx.fillRect(0, g.keyboardTop - 2, width, 2);

  drawKeyboard(ctx, input, g);
}

function drawKeyboard(ctx: CanvasRenderingContext2D, input: FrameInput, g: Geometry): void {
  const { layout, pressed, expected } = input;
  const blackHeight = g.keyboardHeight * 0.62;
  for (const k of layout.keys) {
    const h = k.black ? blackHeight : g.keyboardHeight;
    const result = pressed.get(k.pitch);
    ctx.fillStyle = result ? keyColor(result) : k.black ? COLORS.blackKey : COLORS.whiteKey;
    ctx.fillRect(k.x, g.keyboardTop, k.width, h);
    if (!k.black) {
      ctx.fillStyle = COLORS.whiteKeyEdge;
      ctx.fillRect(k.x + k.width - 1, g.keyboardTop, 1, h);
    }
    if (expected.has(k.pitch) && !result) {
      ctx.fillStyle = COLORS.expected;
      ctx.fillRect(k.x, g.keyboardTop, k.width, h);
    }
  }
}
