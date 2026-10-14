import { PracticeSession, practicedRoles } from '../engine/session';
import type { LoopRange, SessionConfig, SessionState } from '../engine/types';
import type { ConnectionManager } from '../midi-io/connection-manager';
import { PIANO_HIGH, PIANO_LOW } from '../song/parse';
import type { PlayableNote, PlayRole } from '../song/types';
import { drawFrame, maxNoteDuration } from '../render/renderer';
import { layoutKeyboard, songRange, type KeyboardLayout } from '../render/keyboard-layout';
import { KeyboardInput } from './keyboard-input';
import { restartPosition } from './restart-position';

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
  private readonly firstNoteStart: number;
  private practiced: Set<PlayRole>;
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
    this.firstNoteStart = notes.reduce((min, n) => Math.min(min, n.start), Infinity);
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
    const input = new KeyboardInput(
      this.canvas,
      () => (this.layout ? { layout: this.layout, cssWidth: this.cssWidth, cssHeight: this.cssHeight } : null),
      (type, pitch) => this.virtual(type, pitch),
    );
    this.cleanups.push(input.attach());
    // Leaving or closing the app must not leave notes hanging on the piano.
    const onPageHide = () => this.connection.send({ type: 'allNotesOff' });
    window.addEventListener('pagehide', onPageHide);
    this.cleanups.push(() => window.removeEventListener('pagehide', onPageHide));
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

  /**
   * Starts a fresh session with new settings (hand change or retry). With
   * `keepPosition`, a run that is under way continues from the same point;
   * a finished run or one still in its lead-in starts over.
   */
  restart(changes: Partial<SessionConfig>, keepPosition: boolean): void {
    const position = keepPosition ? restartPosition(this.session.getState(), this.firstNoteStart) : null;
    this.connection.send({ type: 'allNotesOff' });
    this.config = { ...this.config, ...changes };
    this.practiced = practicedRoles(this.config.practice);
    const now = performance.now();
    this.session = new PracticeSession(this.notes, this.measures, this.config, now);
    if (position !== null && !this.config.loop) this.session.seek(position, now);
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

  private virtual(type: 'on' | 'off', pitch: number): void {
    this.connection.emitVirtual({ type, pitch, velocity: 0.8, timeMs: performance.now() });
  }
}
