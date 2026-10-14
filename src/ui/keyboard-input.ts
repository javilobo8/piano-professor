import { keyAt, type KeyboardLayout } from '../render/keyboard-layout';
import { geometry } from '../render/renderer';
import { DEFAULT_BASE_PITCH, OCTAVE_DOWN_KEY, OCTAVE_UP_KEY, pcKeyToPitch, shiftOctave } from './pc-keyboard';

export interface KeyboardSurface {
  layout: KeyboardLayout;
  cssWidth: number;
  cssHeight: number;
}

function isFormField(target: EventTarget | null): boolean {
  // The element classes do not exist outside a browser (unit tests).
  if (typeof HTMLInputElement === 'undefined') return false;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
}

/** Touch / mouse on the drawn keyboard and the PC keyboard, as note on / off events. */
export class KeyboardInput {
  private pointers = new Map<number, number>();
  private pcHeld = new Map<string, number>();
  private basePitch = DEFAULT_BASE_PITCH;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly surface: () => KeyboardSurface | null,
    private readonly emit: (type: 'on' | 'off', pitch: number) => void,
    private readonly keyTarget: Window | EventTarget = window,
  ) {}

  /** Starts listening; returns the cleanup. */
  attach(): () => void {
    const cleanups: Array<() => void> = [];
    const listen = (target: EventTarget, type: string, handler: (e: never) => void) => {
      target.addEventListener(type, handler as EventListener);
      cleanups.push(() => target.removeEventListener(type, handler as EventListener));
    };
    listen(this.canvas, 'pointerdown', this.onPointerDown);
    listen(this.canvas, 'pointerup', this.onPointerUp);
    listen(this.canvas, 'pointercancel', this.onPointerUp);
    listen(this.keyTarget, 'keydown', this.onKeyDown);
    listen(this.keyTarget, 'keyup', this.onKeyUp);
    // Switching windows swallows the key-up: never leave a note stuck.
    listen(this.keyTarget, 'blur', this.releaseAll);
    return () => {
      for (const cleanup of cleanups) cleanup();
      this.releaseAll();
    };
  }

  private releaseAll = (): void => {
    const pitches = [...this.pcHeld.values(), ...this.pointers.values()];
    this.pcHeld.clear();
    this.pointers.clear();
    for (const pitch of pitches) this.emit('off', pitch);
  };

  private onPointerDown = (e: PointerEvent): void => {
    const surface = this.surface();
    if (!surface) return;
    const { layout, cssWidth, cssHeight } = surface;
    const rect = this.canvas.getBoundingClientRect();
    const { keyboardTop, keyboardHeight } = geometry(cssWidth, cssHeight, layout.whiteWidth);
    const y = e.clientY - rect.top;
    if (y < keyboardTop) return;
    const pitch = keyAt(layout, e.clientX - rect.left, y < keyboardTop + keyboardHeight * 0.62);
    if (pitch === null) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, pitch);
    this.emit('on', pitch);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const pitch = this.pointers.get(e.pointerId);
    if (pitch === undefined) return;
    this.pointers.delete(e.pointerId);
    this.emit('off', pitch);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isFormField(e.target)) return;
    if (e.code === OCTAVE_DOWN_KEY || e.code === OCTAVE_UP_KEY) {
      this.basePitch = shiftOctave(this.basePitch, e.code === OCTAVE_UP_KEY ? 1 : -1);
      return;
    }
    const pitch = pcKeyToPitch(e.code, this.basePitch);
    if (pitch === null || this.pcHeld.has(e.code)) return;
    this.pcHeld.set(e.code, pitch);
    this.emit('on', pitch);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const pitch = this.pcHeld.get(e.code);
    if (pitch === undefined) return;
    this.pcHeld.delete(e.code);
    this.emit('off', pitch);
  };
}
