import { PracticeSession, practicedRoles } from '../engine/session';
import type { LoopRange, SessionConfig, SessionState } from '../engine/types';
import type { ConnectionManager } from '../midi-io/connection-manager';
import { PIANO_HIGH, PIANO_LOW } from '../song/parse';
import type { PlayableNote, PlayRole } from '../song/types';
import { geometry, drawFrame, maxNoteDuration } from '../render/renderer';
import { keyAt, layoutKeyboard, songRange, type KeyboardLayout } from '../render/keyboard-layout';
import { DEFAULT_BASE_PITCH, OCTAVE_DOWN_KEY, OCTAVE_UP_KEY, pcKeyToPitch, shiftOctave } from './pc-keyboard';

export interface DisplayOptions {
  showAccompaniment: boolean;
  keyboardRange: 'song' | 'full';
  noteLabel: ((pitch: number) => string) | null;
}

/**
 * Runs the play screen: owns the practice session, the animation loop,
 * the canvas and every input source (piano, touch, PC keyboard).
 */
export class PlayController {
  private session: PracticeSession;
  private frame = 0;
  private layout: KeyboardLayout | null = null;
  private cssWidth = 0;
  private cssHeight = 0;
  private readonly maxDuration: number;
  private practiced: Set<PlayRole>;
  private pointers = new Map<number, number>();
  private pcHeld = new Map<string, number>();
  private basePitch = DEFAULT_BASE_PITCH;
  private cleanups: Array<() => void> = [];
  private display: DisplayOptions;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly notes: readonly PlayableNote[],
    private readonly measures: readonly number[],
    private config: SessionConfig,
    private readonly connection: ConnectionManager,
    display: DisplayOptions,
    private readonly onFrame: (state: SessionState) => void,
  ) {
    this.display = display;
    this.maxDuration = maxNoteDuration(notes);
    this.practiced = practicedRoles(config.practice);
    this.session = new PracticeSession(notes, measures, config, performance.now());
  }

  start(): void {
    this.cleanups.push(
      this.connection.onNote((e) => {
        if (e.type === 'on') this.session.noteOn(e.pitch, e.velocity, e.timeMs);
        else this.session.noteOff(e.pitch, e.timeMs);
        this.flush();
      }),
    );
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(this.canvas);
    this.cleanups.push(() => resize.disconnect());
    this.listen(this.canvas, 'pointerdown', this.onPointerDown);
    this.listen(this.canvas, 'pointerup', this.onPointerUp);
    this.listen(this.canvas, 'pointercancel', this.onPointerUp);
    this.listen(window, 'keydown', this.onKeyDown);
    this.listen(window, 'keyup', this.onKeyUp);
    this.resize();
    const loop = () => {
      this.session.tick(performance.now());
      this.flush();
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.connection.send({ type: 'allNotesOff' });
  }

  setDisplay(display: DisplayOptions): void {
    const rangeChanged = display.keyboardRange !== this.display.keyboardRange;
    this.display = display;
    if (rangeChanged) this.resize();
  }

  pause(): void {
    this.session.pause(performance.now());
    this.flush();
  }

  resume(): void {
    this.session.resume(performance.now());
  }

  seek(songTime: number): void {
    this.session.seek(songTime, performance.now());
    this.flush();
  }

  setSpeed(speed: number): void {
    this.session.setSpeed(speed, performance.now());
    this.config = { ...this.config, speed: this.session.getState().speed };
  }

  setLoop(loop: LoopRange | null): void {
    this.session.setLoop(loop, performance.now());
    this.config = { ...this.config, loop };
    this.flush();
  }

  setSound(soundOn: boolean, volume: number): void {
    this.session.setSound(soundOn, volume);
    this.config = { ...this.config, soundOn, volume };
    this.flush();
  }

  /** Starts a fresh session with new settings (hand change or retry). */
  restart(changes: Partial<SessionConfig>, keepPosition: boolean): void {
    const position = this.session.getState().songTime;
    this.connection.send({ type: 'allNotesOff' });
    this.config = { ...this.config, ...changes };
    this.practiced = practicedRoles(this.config.practice);
    const now = performance.now();
    this.session = new PracticeSession(this.notes, this.measures, this.config, now);
    if (keepPosition && !this.config.loop) this.session.seek(position, now);
    this.flush();
  }

  private flush(): void {
    for (const event of this.session.drainOutput()) this.connection.send(event);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    const range =
      this.display.keyboardRange === 'full'
        ? { low: PIANO_LOW, high: PIANO_HIGH }
        : songRange(this.notes.map((n) => n.pitch));
    this.layout = layoutKeyboard(range.low, range.high, rect.width);
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    const state = this.session.getState();
    this.onFrame(state);
    if (!ctx || !this.layout || this.cssWidth === 0) return;
    const dpr = this.canvas.width / this.cssWidth;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const loop = state.loop;
    drawFrame(ctx, {
      width: this.cssWidth,
      height: this.cssHeight,
      layout: this.layout,
      notes: this.notes,
      maxDuration: this.maxDuration,
      songTime: state.songTime,
      practiced: this.practiced,
      showAccompaniment: this.display.showAccompaniment,
      pressed: state.pressed,
      expected: state.expected,
      measures: this.measures,
      loop: loop
        ? {
            start: this.measures[Math.min(loop.startMeasure, this.measures.length - 2)],
            end: this.measures[Math.min(loop.endMeasure + 1, this.measures.length - 1)],
          }
        : null,
      noteLabel: this.display.noteLabel,
    });
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window,
    type: K,
    handler: (e: HTMLElementEventMap[K]) => void,
  ): void {
    target.addEventListener(type, handler as EventListener);
    this.cleanups.push(() => target.removeEventListener(type, handler as EventListener));
  }

  private virtual(type: 'on' | 'off', pitch: number): void {
    this.connection.emitVirtual({ type, pitch, velocity: 0.8, timeMs: performance.now() });
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.layout) return;
    const rect = this.canvas.getBoundingClientRect();
    const { keyboardTop, keyboardHeight } = geometry(this.cssWidth, this.cssHeight, this.layout.whiteWidth);
    const y = e.clientY - rect.top;
    if (y < keyboardTop) return;
    const pitch = keyAt(this.layout, e.clientX - rect.left, y < keyboardTop + keyboardHeight * 0.62);
    if (pitch === null) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, pitch);
    this.virtual('on', pitch);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const pitch = this.pointers.get(e.pointerId);
    if (pitch === undefined) return;
    this.pointers.delete(e.pointerId);
    this.virtual('off', pitch);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === OCTAVE_DOWN_KEY || e.code === OCTAVE_UP_KEY) {
      this.basePitch = shiftOctave(this.basePitch, e.code === OCTAVE_UP_KEY ? 1 : -1);
      return;
    }
    const pitch = pcKeyToPitch(e.code, this.basePitch);
    if (pitch === null || this.pcHeld.has(e.code)) return;
    this.pcHeld.set(e.code, pitch);
    this.virtual('on', pitch);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const pitch = this.pcHeld.get(e.code);
    if (pitch === undefined) return;
    this.pcHeld.delete(e.code);
    this.virtual('off', pitch);
  };
}
