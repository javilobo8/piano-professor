import { geometry } from '../render/renderer';
import type { KeyboardSurface } from './keyboard-input';

/** What the gestures ask of the view. Factors multiply the white keys or seconds shown (< 1 zooms in). */
export interface ViewGestureHandler {
  zoomKeys(factor: number, anchorX: number): void;
  zoomTime(factor: number): void;
  /** Moves the content by dx canvas pixels, as a drag does. */
  pan(dx: number): void;
  /** A gesture ended, or the wheel went quiet: save the zoom. */
  commit(): void;
}

/** Sideways movement before one finger starts panning. */
const DRAG_THRESHOLD = 6;
/** A pinch is never measured narrower than this, so the factor cannot explode. */
const MIN_PINCH_SPAN = 24;
const WHEEL_ZOOM = 0.0025;
const WHEEL_LINE_PX = 16;
const WHEEL_COMMIT_MS = 300;

interface Point {
  x: number;
  y: number;
}

/**
 * Pinch, drag and wheel over the falling notes as zoom and pan. Pointers that start on
 * the keyboard are left to KeyboardInput.
 */
export class ViewGestures {
  /** Pointers that started over the notes (at most two), at their last used position. */
  private points = new Map<number, Point>();
  private pinchAxis: 'x' | 'y' | null = null;
  private dragging = false;
  private wheelTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly surface: () => KeyboardSurface | null,
    private readonly handler: ViewGestureHandler,
  ) {}

  /** Starts listening; returns the cleanup. */
  attach(): () => void {
    const cleanups: Array<() => void> = [];
    const listen = (type: string, handler: (e: never) => void, options?: AddEventListenerOptions) => {
      this.canvas.addEventListener(type, handler as EventListener, options);
      cleanups.push(() => this.canvas.removeEventListener(type, handler as EventListener, options));
    };
    listen('pointerdown', this.onPointerDown);
    listen('pointermove', this.onPointerMove);
    listen('pointerup', this.onPointerUp);
    listen('pointercancel', this.onPointerUp);
    listen('wheel', this.onWheel, { passive: false });
    return () => {
      for (const cleanup of cleanups) cleanup();
      this.points.clear();
      if (this.wheelTimer !== null) {
        clearTimeout(this.wheelTimer);
        this.wheelTimer = null;
        this.handler.commit();
      }
    };
  }

  private local(e: { clientX: number; clientY: number }): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Only the main mouse button drags; right and middle clicks are left alone.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const surface = this.surface();
    if (!surface || this.points.size >= 2) return;
    const p = this.local(e);
    const { keyboardTop } = geometry(surface.cssWidth, surface.cssHeight, surface.layout.whiteWidth);
    if (p.y >= keyboardTop) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.points.set(e.pointerId, p);
    this.dragging = false;
    if (this.points.size === 2) {
      const [a, b] = [...this.points.values()];
      this.pinchAxis = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? 'x' : 'y';
    } else {
      this.pinchAxis = null;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.points.get(e.pointerId);
    if (!prev) return;
    const p = this.local(e);
    if (this.pinchAxis) {
      let other: Point = prev;
      for (const [id, point] of this.points) if (id !== e.pointerId) other = point;
      const axis = this.pinchAxis;
      const before = Math.max(MIN_PINCH_SPAN, Math.abs(prev[axis] - other[axis]));
      const after = Math.max(MIN_PINCH_SPAN, Math.abs(p[axis] - other[axis]));
      this.points.set(e.pointerId, p);
      if (before === after) return;
      if (axis === 'x') this.handler.zoomKeys(before / after, (p.x + other.x) / 2);
      else this.handler.zoomTime(before / after);
      return;
    }
    // Below the threshold the start point is kept, so no movement is lost once dragging starts.
    if (!this.dragging && Math.abs(p.x - prev.x) < DRAG_THRESHOLD) return;
    this.dragging = true;
    this.points.set(e.pointerId, p);
    if (p.x !== prev.x) this.handler.pan(p.x - prev.x);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.points.delete(e.pointerId)) return;
    // The finger left after a pinch carries on as a drag from where it is.
    this.dragging = this.points.size === 1 && this.pinchAxis !== null;
    this.pinchAxis = null;
    this.handler.commit();
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.surface()) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? WHEEL_LINE_PX : 1;
    const dx = e.deltaX * scale;
    const dy = e.deltaY * scale;
    if (e.ctrlKey) this.handler.zoomKeys(Math.exp(dy * WHEEL_ZOOM), this.local(e).x);
    else if (e.shiftKey) this.handler.pan(-(dx !== 0 ? dx : dy));
    // Only a clearly sideways swipe pans; a diagonal one zooms the time.
    else if (Math.abs(dx) > 2 * Math.abs(dy)) this.handler.pan(-dx);
    else if (dy !== 0) this.handler.zoomTime(Math.exp(dy * WHEEL_ZOOM));
    if (this.wheelTimer !== null) clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => {
      this.wheelTimer = null;
      this.handler.commit();
    }, WHEEL_COMMIT_MS);
  };
}
