import type { SoundSink } from '../audio/sound-output';
import { PracticeSession, practicedRoles } from '../engine/session';
import type { LoopRange, SessionConfig, SessionState } from '../engine/types';
import type { ConnectionManager } from '../midi-io/connection-manager';
import { PIANO_HIGH, PIANO_LOW } from '../song/parse';
import type { PlayableNote, PlayRole } from '../song/types';
import { followTarget } from '../render/follow';
import { songRange } from '../render/keyboard-layout';
import { drawFrame, maxNoteDuration } from '../render/renderer';
import { Viewport, ZOOM_STEP, type ViewZoom } from '../render/viewport';
import { KeyboardInput, type KeyboardSurface } from './keyboard-input';
import { LocalNotes } from './local-notes';
import { restartPosition } from './restart-position';
import { ViewGestures } from './view-gestures';
import { ViewReporter, type ViewOptions } from './view-state';

const TOUCH_VELOCITY = 0.8;
/** How quickly the view glides to the notes it follows (time constant, ms). */
const FOLLOW_MS = 150;
const BOTH_HANDS: ReadonlySet<PlayRole> = new Set(['right', 'left']);

export interface DisplayOptions {
  showAccompaniment: boolean;
  keyboardRange: 'song' | 'full';
  noteLabel: ((pitch: number) => string) | null;
}

/**
 * Runs the play screen: owns the practice session, the animation loop, the canvas and its zoom,
 * every input source (piano, touch, PC keyboard) and what it sounds.
 */
export class PlayController {
  private session: PracticeSession;
  private frame = 0;
  private readonly viewport: Viewport;
  private readonly viewReporter: ViewReporter;
  /** While zoomed, the view scrolls by itself to the next notes (until the player drags it). */
  private following = true;
  /** The first follow jumps straight to the notes instead of gliding there. */
  private snapFollow = true;
  private lastFrameMs = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private readonly maxDuration: number;
  private readonly firstNoteStart: number;
  private practiced: Set<PlayRole>;
  private cleanups: Array<() => void> = [];
  private readonly local = new LocalNotes();
  private display: DisplayOptions;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly notes: readonly PlayableNote[],
    private readonly measures: readonly number[],
    private config: SessionConfig,
    private readonly connection: ConnectionManager,
    private readonly output: SoundSink,
    display: DisplayOptions,
    private readonly onFrame: (state: SessionState) => void,
    private readonly view: ViewOptions<ViewZoom>,
  ) {
    this.display = display;
    this.maxDuration = maxNoteDuration(notes);
    this.firstNoteStart = notes.reduce((min, n) => Math.min(min, n.start), Infinity);
    this.practiced = practicedRoles(config.practice);
    this.session = new PracticeSession(notes, measures, this.sessionConfig(), performance.now());
    const range = this.keyRange();
    this.viewport = new Viewport(range.low, range.high, view.zoom);
    this.viewReporter = new ViewReporter(view.onChange);
  }

  start(): void {
    this.cleanups.push(
      this.connection.onNote((e) => {
        // A pitch held on screen is already being played; the same note coming back is an echo.
        if (this.local.has(e.pitch)) return;
        this.press(e.type, e.pitch, e.velocity, e.timeMs);
      }),
    );
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(this.canvas);
    this.cleanups.push(() => resize.disconnect());
    const surface = () => this.surface();
    const input = new KeyboardInput(this.canvas, surface, (type, pitch) => this.virtual(type, pitch));
    this.cleanups.push(input.attach());
    const gestures = new ViewGestures(this.canvas, surface, {
      zoomKeys: (factor, anchorX) => this.viewChanged(this.viewport.zoomKeys(factor, anchorX)),
      zoomTime: (factor) => this.viewChanged(this.viewport.zoomTime(factor)),
      pan: (dx) => {
        if (!this.viewport.zoomed) return;
        this.viewport.panBy(dx);
        this.following = false;
        this.reportView();
      },
      commit: () => this.view.onCommit(this.viewport.zoom()),
    });
    this.cleanups.push(gestures.attach());
    // Leaving or closing the app must not leave notes hanging on the piano.
    const onPageHide = () => this.output.send({ type: 'allNotesOff' });
    window.addEventListener('pagehide', onPageHide);
    this.cleanups.push(() => window.removeEventListener('pagehide', onPageHide));
    this.resize();
    const loop = () => {
      const now = performance.now();
      this.session.tick(now);
      this.flush();
      this.draw(now);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.output.send({ type: 'allNotesOff' });
  }

  setDisplay(display: DisplayOptions): void {
    const rangeChanged = display.keyboardRange !== this.display.keyboardRange;
    this.display = display;
    if (!rangeChanged) return;
    const range = this.keyRange();
    this.viewport.setRange(range.low, range.high);
    this.reportView();
  }

  pause(): void {
    this.session.pause(performance.now());
    this.flush();
  }

  resume(): void {
    this.session.resume(performance.now());
  }

  /** Zoom buttons: 1 zooms in (wider keys), -1 out. */
  zoomKeys(direction: 1 | -1): void {
    this.viewChanged(this.viewport.zoomKeys(direction === 1 ? 1 / ZOOM_STEP : ZOOM_STEP, this.cssWidth / 2));
    this.view.onCommit(this.viewport.zoom());
  }

  /** Zoom buttons: 1 zooms in (notes further apart), -1 out (more notes ahead). */
  zoomTime(direction: 1 | -1): void {
    this.viewChanged(this.viewport.zoomTime(direction === 1 ? 1 / ZOOM_STEP : ZOOM_STEP));
    this.view.onCommit(this.viewport.zoom());
  }

  /** Back to the whole keyboard at the default seconds. */
  fit(): void {
    this.viewport.fit();
    this.following = true;
    this.reportView();
    this.view.onCommit(this.viewport.zoom());
  }

  /** Follows the notes again after the player dragged the view away. */
  follow(): void {
    this.following = true;
    this.reportView();
  }

  seek(songTime: number): void {
    this.session.seek(songTime, performance.now());
    this.flush();
    this.resumeFollowing();
  }

  setSpeed(speed: number): void {
    this.session.setSpeed(speed, performance.now());
    this.config = { ...this.config, speed: this.session.getState().speed };
  }

  setLoop(loop: LoopRange | null): void {
    this.session.setLoop(loop, performance.now());
    this.config = { ...this.config, loop };
    this.flush();
    this.resumeFollowing();
  }

  setSound(soundOn: boolean, volume: number): void {
    this.config = { ...this.config, soundOn, volume };
    this.session.setSound(this.sessionConfig().soundOn, volume);
    this.flush();
  }

  /**
   * Starts a fresh session with new settings (hand change or retry). With
   * `keepPosition`, a run that is under way continues from the same point;
   * a finished run or one still in its lead-in starts over.
   */
  restart(changes: Partial<SessionConfig>, keepPosition: boolean): void {
    const position = keepPosition ? restartPosition(this.session.getState(), this.firstNoteStart) : null;
    this.output.send({ type: 'allNotesOff' });
    this.config = { ...this.config, ...changes };
    this.practiced = practicedRoles(this.config.practice);
    const now = performance.now();
    this.session = new PracticeSession(this.notes, this.measures, this.sessionConfig(), now);
    if (position !== null && !this.config.loop) this.session.seek(position, now);
    this.flush();
    this.resumeFollowing();
  }

  private get listening(): boolean {
    return this.config.practice === 'none';
  }

  /** When just listening the whole song sounds, even with "play the other parts" off. */
  private sessionConfig(): SessionConfig {
    return this.listening ? { ...this.config, soundOn: true } : this.config;
  }

  private flush(): void {
    for (const event of this.session.drainOutput()) this.output.send(event);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.viewport.resize(rect.width);
    this.reportView();
  }

  private keyRange(): { low: number; high: number } {
    return this.display.keyboardRange === 'full'
      ? { low: PIANO_LOW, high: PIANO_HIGH }
      : songRange(this.notes.map((n) => n.pitch));
  }

  private surface(): KeyboardSurface | null {
    if (this.cssWidth === 0) return null;
    return {
      layout: this.viewport.layout,
      cssWidth: this.cssWidth,
      cssHeight: this.cssHeight,
      scrollX: this.viewport.scrollX,
    };
  }

  private viewChanged(changed: boolean): void {
    if (changed) this.reportView();
  }

  private reportView(): void {
    this.viewReporter.report(this.viewport, this.viewport.zoomed && !this.following);
  }

  /** A seek, restart or loop change: the view goes back to following the notes. */
  private resumeFollowing(): void {
    this.following = true;
    this.reportView();
  }

  /** While zoomed and following, glides the view so the next notes of the practised hands stay on screen. */
  private followNotes(nowMs: number, songTime: number): void {
    const dt = nowMs - this.lastFrameMs;
    this.lastFrameMs = nowMs;
    if (!this.following || !this.viewport.zoomed || this.cssWidth === 0) return;
    const roles = this.practiced.size > 0 ? this.practiced : BOTH_HANDS;
    const target = followTarget(this.notes, this.maxDuration, roles, songTime, this.viewport);
    if (target === null) return;
    const x = this.viewport.scrollX;
    this.viewport.scrollTo(this.snapFollow ? target : x + (target - x) * (1 - Math.exp(-dt / FOLLOW_MS)));
    this.snapFollow = false;
  }

  private draw(nowMs: number): void {
    const ctx = this.canvas.getContext('2d');
    const state = this.session.getState();
    this.onFrame(state);
    this.followNotes(nowMs, state.songTime);
    if (!ctx || this.cssWidth === 0) return;
    const dpr = this.canvas.width / this.cssWidth;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const loop = state.loop;
    drawFrame(ctx, {
      width: this.cssWidth,
      height: this.cssHeight,
      layout: this.viewport.layout,
      scrollX: this.viewport.scrollX,
      seconds: this.viewport.seconds,
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
      showPlayedKeys: this.listening,
    });
  }

  private press(type: 'on' | 'off', pitch: number, velocity: number, timeMs: number): void {
    if (type === 'on') this.session.noteOn(pitch, velocity, timeMs);
    else this.session.noteOff(pitch, timeMs);
    this.flush();
  }

  /**
   * Touch and PC-keyboard notes: judged like piano keys and sounded through the output.
   * The note is sent after the session's output, so the all-notes-off that completes a wait step does not cut it.
   */
  private virtual(type: 'on' | 'off', pitch: number): void {
    const now = performance.now();
    if (type === 'on') {
      if (!this.local.press(pitch)) return;
      this.press('on', pitch, TOUCH_VELOCITY, now);
      this.output.send({ type: 'noteOn', pitch, velocity: Math.round(TOUCH_VELOCITY * 127) });
    } else {
      if (!this.local.release(pitch)) return;
      this.press('off', pitch, 0, now);
      this.output.send({ type: 'noteOff', pitch });
    }
  }
}
