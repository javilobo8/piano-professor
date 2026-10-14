import type { KeyResult } from '../engine/types';
import type { PlayableNote, PlayRole } from '../song/types';
import { lowerBound } from '../util/bisect';
import { COLORS } from './colors';
import type { KeyboardLayout } from './keyboard-layout';
import type { TrailNote } from './note-trail';

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
  /** Light the keys of the notes sounding now (when just listening, nobody presses them). */
  showPlayedKeys: boolean;
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

function playedKeyColor(role: PlayRole): string {
  if (role === 'accompaniment') return COLORS.accompaniment;
  return role === 'left' ? COLORS.left : COLORS.right;
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

  drawBackground(ctx, width, height, layout, g);

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
  const played = new Map<number, PlayRole>();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = labelFont(layout);
  for (let i = from; i < to; i++) {
    const n = input.notes[i];
    if (n.end < songTime) continue;
    if (n.role === 'accompaniment' && !input.showAccompaniment) continue;
    const key = layout.byPitch.get(n.pitch);
    if (!key) continue;
    if (input.showPlayedKeys && n.start <= songTime && songTime < n.end) played.set(n.pitch, n.role);
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

  drawHitLine(ctx, width, g);
  drawKeyboard(ctx, layout, input.pressed, input.expected, g, played);
}

function labelFont(layout: KeyboardLayout): string {
  return `600 ${Math.max(9, Math.min(13, layout.whiteWidth * 0.45))}px system-ui, sans-serif`;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layout: KeyboardLayout,
  g: Geometry,
): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Darker lanes under black keys.
  ctx.fillStyle = COLORS.blackLane;
  for (const k of layout.keys) if (k.black) ctx.fillRect(k.x, 0, k.width, g.keyboardTop);
}

function drawHitLine(ctx: CanvasRenderingContext2D, width: number, g: Geometry): void {
  ctx.fillStyle = COLORS.hitLine;
  ctx.fillRect(0, g.keyboardTop - 2, width, 2);
}

function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  pressed: ReadonlyMap<number, KeyResult>,
  expected: ReadonlySet<number>,
  g: Geometry,
  played: ReadonlyMap<number, PlayRole>,
): void {
  const blackHeight = g.keyboardHeight * 0.62;
  for (const k of layout.keys) {
    const h = k.black ? blackHeight : g.keyboardHeight;
    const result = pressed.get(k.pitch);
    const role = played.get(k.pitch);
    if (result) ctx.fillStyle = keyColor(result);
    else if (role) ctx.fillStyle = playedKeyColor(role);
    else ctx.fillStyle = k.black ? COLORS.blackKey : COLORS.whiteKey;
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

/** Vertical extent of a rising bar at nowMs (CSS px; top < bottom). Minimum height 4 px. */
export function trailRect(note: TrailNote, nowMs: number, g: Geometry): { top: number; bottom: number } {
  const bottom = g.keyboardTop - ((nowMs - (note.endMs ?? nowMs)) / 1000) * g.pxPerSecond;
  let top = g.keyboardTop - ((nowMs - note.startMs) / 1000) * g.pxPerSecond;
  if (bottom - top < 4) top = bottom - 4;
  return { top, bottom };
}

export interface FreePlayFrameInput {
  /** CSS pixels. */
  width: number;
  height: number;
  layout: KeyboardLayout;
  notes: readonly TrailNote[];
  nowMs: number;
  /** Label drawn inside rising bars, or null for none. */
  noteLabel: ((pitch: number) => string) | null;
}

const NO_KEYS: ReadonlySet<number> = new Set();
const NO_PLAYED: ReadonlyMap<number, PlayRole> = new Map();

/** Hand colour by side of middle C: below 60 → 'left', 60 and up → 'right'. */
export function freePlaySide(pitch: number): 'left' | 'right' {
  return pitch < 60 ? 'left' : 'right';
}

export function drawFreePlayFrame(ctx: CanvasRenderingContext2D, input: FreePlayFrameInput): void {
  const { width, height, layout, nowMs } = input;
  const g = geometry(width, height, layout.whiteWidth);

  drawBackground(ctx, width, height, layout, g);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = labelFont(layout);
  const pressed = new Map<number, KeyResult>();
  for (const n of input.notes) {
    const key = layout.byPitch.get(n.pitch);
    if (!key) continue;
    const side = freePlaySide(n.pitch);
    if (n.endMs === null) pressed.set(n.pitch, side);
    const { top, bottom } = trailRect(n, nowMs, g);
    const h = bottom - top;
    ctx.globalAlpha = 0.55 + 0.45 * n.velocity;
    ctx.fillStyle =
      side === 'left' ? (key.black ? COLORS.leftDark : COLORS.left) : key.black ? COLORS.rightDark : COLORS.right;
    ctx.beginPath();
    ctx.roundRect(key.x + 1, top, key.width - 2, h, Math.min(5, key.width / 3));
    ctx.fill();
    if (input.noteLabel && h >= 16 && key.width >= 12) {
      ctx.fillStyle = COLORS.label;
      ctx.fillText(input.noteLabel(n.pitch), key.x + key.width / 2, top + 3);
    }
  }
  ctx.globalAlpha = 1;

  drawHitLine(ctx, width, g);
  drawKeyboard(ctx, layout, pressed, NO_KEYS, g, NO_PLAYED);
}
