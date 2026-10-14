import type { KeyResult } from '../engine/types';
import type { PlayableNote, PlayRole } from '../song/types';
import { lowerBound } from '../util/bisect';
import { COLORS } from './colors';
import type { KeyboardLayout, KeyRect } from './keyboard-layout';
import type { TrailNote } from './note-trail';
import { DEFAULT_SECONDS } from './viewport';

/** Height of the bar on top that shows where a zoomed view is on the keyboard. */
const POSITION_BAR_HEIGHT = 4;

export interface FrameInput {
  /** CSS pixels. */
  width: number;
  height: number;
  /** The whole keyboard at the zoomed key width, in content pixels. */
  layout: KeyboardLayout;
  /** Content pixels scrolled off the left edge. */
  scrollX: number;
  /** Song seconds visible above the keyboard. */
  seconds: number;
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

export function geometry(width: number, height: number, whiteWidth: number, seconds = DEFAULT_SECONDS): Geometry {
  const keyboardHeight = Math.round(Math.min(height * 0.26, Math.max(height * 0.14, whiteWidth * 5)));
  const keyboardTop = height - keyboardHeight;
  return { keyboardTop, keyboardHeight, pxPerSecond: keyboardTop / seconds };
}

/** Index range [from, to) of notes visible at songTime with `seconds` on screen. */
export function visibleRange(
  notes: readonly PlayableNote[],
  songTime: number,
  maxDuration: number,
  seconds: number,
): [number, number] {
  return [lowerBound(notes, songTime - maxDuration), lowerBound(notes, songTime + seconds + 0.001)];
}

/** Whether a key is at least partly inside the view. */
function onScreen(key: KeyRect, scrollX: number, width: number): boolean {
  return key.x + key.width > scrollX && key.x < scrollX + width;
}

export function maxNoteDuration(notes: readonly PlayableNote[]): number {
  return notes.reduce((max, n) => Math.max(max, n.end - n.start), 0);
}

function noteColor(note: PlayableNote, black: boolean): string {
  if (note.role === 'accompaniment') return COLORS.accompaniment;
  if (note.role === 'left') return black ? COLORS.leftDark : COLORS.left;
  return black ? COLORS.rightDark : COLORS.right;
}

/** Halo colour drawn around a practised note of this hand. */
function noteGlow(role: 'left' | 'right'): string {
  return role === 'left' ? COLORS.leftGlow : COLORS.rightGlow;
}

/** Halo 3 px larger on every side (behind the note). No shadowBlur: one extra fill. */
function drawGlow(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, h: number, glow: string): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.roundRect(x - 3, top - 3, w + 6, h + 6, Math.min(8, w / 3 + 3));
  ctx.fill();
}

/** The note body, plus a 2 px shine strip on top when `shine` and the note is tall enough. */
function drawNoteBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  w: number,
  h: number,
  color: string,
  shine: boolean,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, top, w, h, Math.min(5, w / 3));
  ctx.fill();
  if (shine && h >= 8 && w > 4) {
    ctx.fillStyle = COLORS.noteShine;
    ctx.fillRect(x + 2, top + 1, w - 4, 2);
  }
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
  const { width, height, layout, songTime, scrollX } = input;
  const g = geometry(width, height, layout.whiteWidth, input.seconds);
  const yOf = (t: number) => g.keyboardTop - (t - songTime) * g.pxPerSecond;

  drawBackground(ctx, width, height, layout, g, scrollX);

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

  const [from, to] = visibleRange(input.notes, songTime, input.maxDuration, input.seconds);
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
    if (!onScreen(key, scrollX, width)) continue;
    const x = key.x - scrollX;
    const top = yOf(n.end);
    const bottom = yOf(n.start);
    const h = Math.max(4, bottom - top);
    const faded = n.role === 'accompaniment' || (input.practiced.size > 0 && !input.practiced.has(n.role));
    if (!faded && n.role !== 'accompaniment') drawGlow(ctx, x + 1, bottom - h, key.width - 2, h, noteGlow(n.role));
    ctx.globalAlpha = n.role === 'accompaniment' ? 0.45 : faded ? 0.35 : 1;
    drawNoteBody(ctx, x + 1, bottom - h, key.width - 2, h, noteColor(n, key.black), !faded);
    if (input.noteLabel && !faded && h >= 16 && key.width >= 12) {
      ctx.fillStyle = COLORS.label;
      ctx.fillText(input.noteLabel(n.pitch), x + key.width / 2, bottom - 3);
    }
  }
  ctx.globalAlpha = 1;

  drawHitLine(ctx, width, g);
  drawKeyboard(ctx, layout, input.pressed, input.expected, g, played, scrollX, width);
  drawPositionBar(ctx, width, layout, scrollX);
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
  scrollX: number,
): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Darker lanes under black keys.
  ctx.fillStyle = COLORS.blackLane;
  for (const k of layout.keys) {
    if (k.black && onScreen(k, scrollX, width)) ctx.fillRect(k.x - scrollX, 0, k.width, g.keyboardTop);
  }
}

interface GradientCache {
  ctx: CanvasRenderingContext2D;
  width: number;
  top: number;
  height: number;
  white: CanvasGradient;
  black: CanvasGradient;
  hit: CanvasGradient;
}

/** Keyboard and hit-line gradients, rebuilt only when the canvas or geometry changes. */
let cache: GradientCache | null = null;

function gradients(ctx: CanvasRenderingContext2D, width: number, g: Geometry): GradientCache {
  if (
    cache &&
    cache.ctx === ctx &&
    cache.width === width &&
    cache.top === g.keyboardTop &&
    cache.height === g.keyboardHeight
  ) {
    return cache;
  }
  const white = ctx.createLinearGradient(0, g.keyboardTop, 0, g.keyboardTop + g.keyboardHeight);
  white.addColorStop(0, COLORS.whiteKey);
  white.addColorStop(1, COLORS.whiteKeyShade);
  const black = ctx.createLinearGradient(0, g.keyboardTop, 0, g.keyboardTop + g.keyboardHeight * 0.62);
  black.addColorStop(0, COLORS.blackKeyTop);
  black.addColorStop(1, COLORS.blackKey);
  const hit = ctx.createLinearGradient(0, 0, width, 0);
  hit.addColorStop(0, COLORS.hitLineFrom);
  hit.addColorStop(1, COLORS.hitLineTo);
  cache = { ctx, width, top: g.keyboardTop, height: g.keyboardHeight, white, black, hit };
  return cache;
}

function drawHitLine(ctx: CanvasRenderingContext2D, width: number, g: Geometry): void {
  const { hit } = gradients(ctx, width, g);
  ctx.fillStyle = COLORS.hitGlow;
  ctx.fillRect(0, g.keyboardTop - 6, width, 6);
  ctx.fillStyle = hit;
  ctx.fillRect(0, g.keyboardTop - 2, width, 2);
}

function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  pressed: ReadonlyMap<number, KeyResult>,
  expected: ReadonlySet<number>,
  g: Geometry,
  played: ReadonlyMap<number, PlayRole>,
  scrollX: number,
  width: number,
): void {
  const blackHeight = g.keyboardHeight * 0.62;
  const { white, black } = gradients(ctx, width, g);
  for (const k of layout.keys) {
    if (!onScreen(k, scrollX, width)) continue;
    const x = k.x - scrollX;
    const h = k.black ? blackHeight : g.keyboardHeight;
    const result = pressed.get(k.pitch);
    const role = played.get(k.pitch);
    if (result) ctx.fillStyle = keyColor(result);
    else if (role) ctx.fillStyle = playedKeyColor(role);
    else ctx.fillStyle = k.black ? black : white;
    ctx.fillRect(x, g.keyboardTop, k.width, h);
    if (!k.black) {
      ctx.fillStyle = COLORS.whiteKeyEdge;
      ctx.fillRect(x + k.width - 1, g.keyboardTop, 1, h);
    }
    if (expected.has(k.pitch) && !result) {
      ctx.fillStyle = COLORS.expected;
      ctx.fillRect(x, g.keyboardTop, k.width, h);
    }
  }
}

/** Where a zoomed view is on the whole keyboard: a thin bar on top. Nothing when it all fits. */
function drawPositionBar(ctx: CanvasRenderingContext2D, width: number, layout: KeyboardLayout, scrollX: number): void {
  if (layout.width <= width + 0.5) return;
  ctx.fillStyle = COLORS.scrollTrack;
  ctx.fillRect(0, 0, width, POSITION_BAR_HEIGHT);
  ctx.fillStyle = COLORS.scrollThumb;
  ctx.fillRect((scrollX / layout.width) * width, 0, (width / layout.width) * width, POSITION_BAR_HEIGHT);
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
  /** The whole keyboard at the zoomed key width, in content pixels. */
  layout: KeyboardLayout;
  /** Content pixels scrolled off the left edge. */
  scrollX: number;
  /** Seconds a bar takes to rise from the keyboard to the top. */
  seconds: number;
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
  const { width, height, layout, nowMs, scrollX } = input;
  const g = geometry(width, height, layout.whiteWidth, input.seconds);

  drawBackground(ctx, width, height, layout, g, scrollX);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = labelFont(layout);
  const pressed = new Map<number, KeyResult>();
  for (const n of input.notes) {
    const key = layout.byPitch.get(n.pitch);
    if (!key) continue;
    const side = freePlaySide(n.pitch);
    if (n.endMs === null) pressed.set(n.pitch, side);
    if (!onScreen(key, scrollX, width)) continue;
    const x = key.x - scrollX;
    const { top, bottom } = trailRect(n, nowMs, g);
    const h = bottom - top;
    drawGlow(ctx, x + 1, top, key.width - 2, h, noteGlow(side));
    ctx.globalAlpha = 0.55 + 0.45 * n.velocity;
    const color =
      side === 'left' ? (key.black ? COLORS.leftDark : COLORS.left) : key.black ? COLORS.rightDark : COLORS.right;
    drawNoteBody(ctx, x + 1, top, key.width - 2, h, color, true);
    if (input.noteLabel && h >= 16 && key.width >= 12) {
      ctx.fillStyle = COLORS.label;
      ctx.fillText(input.noteLabel(n.pitch), x + key.width / 2, top + 3);
    }
  }
  ctx.globalAlpha = 1;

  drawHitLine(ctx, width, g);
  drawKeyboard(ctx, layout, pressed, NO_KEYS, g, NO_PLAYED, scrollX, width);
  drawPositionBar(ctx, width, layout, scrollX);
}
