import { isBlack, layoutKeyboard, type KeyboardLayout } from './keyboard-layout';

/** Song seconds visible above the keyboard by default, and the vertical zoom limits. */
export const DEFAULT_SECONDS = 3;
export const MIN_SECONDS = 1.5;
export const MAX_SECONDS = 8;
/** Fewest white keys on screen (unless the range itself has fewer). */
export const MIN_WHITE_KEYS = 8;
/** White keys on an 88-key piano. */
export const ALL_WHITE_KEYS = 52;
/** One press of a zoom button multiplies or divides by this. */
export const ZOOM_STEP = 1.25;

const EPSILON = 1e-6;

export interface ViewZoom {
  /** Most white keys on screen; null = the whole keyboard range. */
  whiteKeys: number | null;
  /** Song seconds visible above the keyboard. */
  seconds: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function whiteKeysBetween(low: number, high: number): number {
  let count = 0;
  for (let p = low; p <= high; p++) if (!isBlack(p)) count++;
  return count;
}

/**
 * What part of the keyboard and of the song is on screen. The horizontal state is kept
 * in white keys (left edge and how many are visible) so it survives resizes; `layout`
 * lays the whole range out at the zoomed key width, in content pixels.
 */
export class Viewport {
  private low: number;
  private high: number;
  private whiteCount: number;
  /** White keys on screen (fractional). */
  private visible: number;
  /** Left edge of the view, in white keys from `low`. */
  private left = 0;
  private width = 0;
  /** The saved `whiteKeys`; replaced only when what is visible changes. */
  private stored: number | null;
  private secondsVisible: number;
  private currentLayout: KeyboardLayout;

  constructor(low: number, high: number, zoom: ViewZoom) {
    this.low = low;
    this.high = high;
    this.whiteCount = whiteKeysBetween(low, high);
    this.stored = zoom.whiteKeys;
    this.visible = this.effectiveVisible();
    this.secondsVisible = clamp(zoom.seconds, MIN_SECONDS, MAX_SECONDS);
    this.currentLayout = this.buildLayout();
  }

  /** The whole range at the zoomed key width; key x in content pixels. */
  get layout(): KeyboardLayout {
    return this.currentLayout;
  }

  get viewWidth(): number {
    return this.width;
  }

  get seconds(): number {
    return this.secondsVisible;
  }

  get visibleWhites(): number {
    return this.visible;
  }

  /** True when part of the range is off screen. */
  get zoomed(): boolean {
    return this.visible < this.whiteCount - EPSILON;
  }

  /** Content pixels scrolled off the left edge. */
  get scrollX(): number {
    return this.left * this.whiteWidth;
  }

  get maxScroll(): number {
    return (this.whiteCount - this.visible) * this.whiteWidth;
  }

  private get whiteWidth(): number {
    return this.visible > 0 ? this.width / this.visible : 0;
  }

  private get minVisible(): number {
    return Math.min(MIN_WHITE_KEYS, this.whiteCount);
  }

  resize(width: number): void {
    if (width === this.width) return;
    this.width = width;
    this.currentLayout = this.buildLayout();
  }

  /** Changes the key range, keeping the saved zoom and the key in the middle. */
  setRange(low: number, high: number): void {
    const center = this.centerPitch();
    this.low = low;
    this.high = high;
    this.whiteCount = whiteKeysBetween(low, high);
    this.visible = this.effectiveVisible();
    this.centerOn(center);
    this.currentLayout = this.buildLayout();
  }

  /**
   * Shows `factor` times as many white keys, keeping the content under `anchorX` (view
   * pixels) in place. Returns whether anything changed.
   */
  zoomKeys(factor: number, anchorX: number): boolean {
    const next = clamp(this.visible * factor, this.minVisible, this.whiteCount);
    if (Math.abs(next - this.visible) < EPSILON) return false;
    const fraction = this.width > 0 ? clamp(anchorX / this.width, 0, 1) : 0.5;
    const anchor = this.left + fraction * this.visible;
    this.visible = next;
    this.stored = next >= this.whiteCount - EPSILON ? null : next;
    this.setLeft(anchor - fraction * next);
    this.currentLayout = this.buildLayout();
    return true;
  }

  /** Shows `factor` times as many seconds. Returns whether anything changed. */
  zoomTime(factor: number): boolean {
    const next = clamp(this.secondsVisible * factor, MIN_SECONDS, MAX_SECONDS);
    if (Math.abs(next - this.secondsVisible) < EPSILON) return false;
    this.secondsVisible = next;
    return true;
  }

  /** Moves the content by dx view pixels, as a drag does. */
  panBy(dx: number): void {
    if (this.whiteWidth > 0) this.setLeft(this.left - dx / this.whiteWidth);
  }

  /** Scrolls so the content pixel x is at the left edge. */
  scrollTo(x: number): void {
    if (this.whiteWidth > 0) this.setLeft(x / this.whiteWidth);
  }

  /** Puts `pitch` in the middle of the view, as far as the range allows. Works before the first resize. */
  centerOn(pitch: number): void {
    const p = clamp(Math.round(pitch), this.low, this.high);
    const whitesBefore = whiteKeysBetween(this.low, p - 1);
    this.setLeft(whitesBefore + (isBlack(p) ? 0 : 0.5) - this.visible / 2);
  }

  /** The white key in the middle of the view. */
  centerPitch(): number {
    const target = Math.min(this.whiteCount - 1, Math.floor(this.left + this.visible / 2));
    let index = 0;
    for (let p = this.low; p <= this.high; p++) {
      if (isBlack(p)) continue;
      if (index === target) return p;
      index++;
    }
    return this.high;
  }

  /** Back to the whole range and the default seconds. */
  fit(): void {
    this.stored = null;
    this.visible = this.whiteCount;
    this.left = 0;
    this.secondsVisible = DEFAULT_SECONDS;
    this.currentLayout = this.buildLayout();
  }

  /** What to save. */
  zoom(): ViewZoom {
    return { whiteKeys: this.stored, seconds: this.secondsVisible };
  }

  /** 1 = zoom in (fewer, wider keys), -1 = zoom out. */
  canZoomKeys(direction: 1 | -1): boolean {
    return direction === 1 ? this.visible > this.minVisible + EPSILON : this.zoomed;
  }

  /** 1 = zoom in (fewer seconds, notes further apart), -1 = zoom out. */
  canZoomTime(direction: 1 | -1): boolean {
    return direction === 1
      ? this.secondsVisible > MIN_SECONDS + EPSILON
      : this.secondsVisible < MAX_SECONDS - EPSILON;
  }

  private effectiveVisible(): number {
    return this.stored === null ? this.whiteCount : clamp(this.stored, this.minVisible, this.whiteCount);
  }

  private setLeft(left: number): void {
    this.left = clamp(left, 0, this.whiteCount - this.visible);
  }

  private buildLayout(): KeyboardLayout {
    return layoutKeyboard(this.low, this.high, this.whiteWidth * this.whiteCount);
  }
}
