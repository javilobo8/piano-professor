import type { SoundSink } from '../audio/sound-output';
import type { ConnectionManager } from '../midi-io/connection-manager';
import { layoutKeyboard, type KeyboardLayout } from '../render/keyboard-layout';
import { NoteTrail } from '../render/note-trail';
import { drawFreePlayFrame } from '../render/renderer';
import { DEFAULT_SECONDS } from '../render/viewport';
import { PIANO_HIGH, PIANO_LOW } from '../song/parse';
import { KeyboardInput } from './keyboard-input';
import { LocalNotes } from './local-notes';

const TOUCH_VELOCITY = 0.8;

/**
 * Runs the free-play screen: the full keyboard, no song. Every note played
 * (piano, touch or PC keyboard) rises from its key as a bar.
 */
export class FreePlayController {
  private readonly trail = new NoteTrail();
  private frame = 0;
  private layout: KeyboardLayout | null = null;
  private cssWidth = 0;
  private cssHeight = 0;
  private heldKey = '';
  private input: KeyboardInput | null = null;
  /** On-screen / PC-keyboard sources holding each pitch. */
  private readonly local = new LocalNotes();
  private firstNoteSeen = false;
  private cleanups: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly connection: ConnectionManager,
    private readonly output: SoundSink,
    private noteLabel: ((pitch: number) => string) | null,
    private readonly onHeldChange: (held: number[]) => void,
    private readonly onFirstNote: () => void,
  ) {}

  start(): void {
    this.cleanups.push(
      this.connection.onNote((e) => {
        // A pitch held on screen is already shown; the same note coming back is an echo.
        if (this.local.has(e.pitch)) return;
        if (e.type === 'on') this.noteOn(e.pitch, e.velocity, e.timeMs);
        else this.trail.noteOff(e.pitch, e.timeMs);
      }),
    );
    // A dropped link never delivers the note-offs: release what the piano was holding.
    this.cleanups.push(
      this.connection.subscribe((status) => {
        if (status.state === 'connected') return;
        const now = performance.now();
        for (const pitch of this.trail.held()) if (!this.local.has(pitch)) this.trail.noteOff(pitch, now);
      }),
    );
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(this.canvas);
    this.cleanups.push(() => resize.disconnect());
    const input = new KeyboardInput(
      this.canvas,
      () => (this.layout ? { layout: this.layout, cssWidth: this.cssWidth, cssHeight: this.cssHeight, scrollX: 0 } : null),
      (type, pitch) => this.touch(type, pitch),
    );
    this.input = input;
    this.cleanups.push(input.attach());
    // Leaving or closing the app must not leave notes hanging on the piano.
    const onPageHide = () => this.releaseAll();
    window.addEventListener('pagehide', onPageHide);
    this.cleanups.push(() => window.removeEventListener('pagehide', onPageHide));
    this.resize();
    const loop = () => {
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.input = null;
    this.output.send({ type: 'allNotesOff' });
  }

  /** Lets go of everything: on-screen input, the trail and every sounding note. */
  releaseAll(): void {
    this.input?.releaseAll();
    this.trail.releaseAll(performance.now());
    this.output.send({ type: 'allNotesOff' });
  }

  setNoteLabel(noteLabel: ((pitch: number) => string) | null): void {
    this.noteLabel = noteLabel;
  }

  /** Touch and PC-keyboard notes: shown on the trail and sounded through the output (not echoed back). */
  private touch(type: 'on' | 'off', pitch: number): void {
    const now = performance.now();
    if (type === 'on') {
      if (!this.local.press(pitch)) return;
      this.noteOn(pitch, TOUCH_VELOCITY, now);
      this.output.send({ type: 'noteOn', pitch, velocity: Math.round(TOUCH_VELOCITY * 127) });
    } else {
      if (!this.local.release(pitch)) return;
      this.trail.noteOff(pitch, now);
      this.output.send({ type: 'noteOff', pitch });
    }
  }

  private noteOn(pitch: number, velocity: number, timeMs: number): void {
    this.trail.noteOn(pitch, velocity, timeMs);
    if (this.firstNoteSeen) return;
    this.firstNoteSeen = true;
    this.onFirstNote();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.layout = layoutKeyboard(PIANO_LOW, PIANO_HIGH, rect.width);
  }

  private draw(): void {
    const nowMs = performance.now();
    const notes = this.trail.visible(nowMs, DEFAULT_SECONDS);
    const held = this.trail.held();
    const heldKey = held.join(',');
    if (heldKey !== this.heldKey) {
      this.heldKey = heldKey;
      this.onHeldChange(held);
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !this.layout || this.cssWidth === 0) return;
    const dpr = this.canvas.width / this.cssWidth;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFreePlayFrame(ctx, {
      width: this.cssWidth,
      height: this.cssHeight,
      layout: this.layout,
      scrollX: 0,
      seconds: DEFAULT_SECONDS,
      notes,
      nowMs,
      noteLabel: this.noteLabel,
    });
  }
}
