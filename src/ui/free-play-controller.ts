import type { ConnectionManager } from '../midi-io/connection-manager';
import { layoutKeyboard, type KeyboardLayout } from '../render/keyboard-layout';
import { NoteTrail } from '../render/note-trail';
import { drawFreePlayFrame } from '../render/renderer';
import { PIANO_HIGH, PIANO_LOW } from '../song/parse';
import { KeyboardInput } from './keyboard-input';

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
  private cleanups: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly connection: ConnectionManager,
    private noteLabel: ((pitch: number) => string) | null,
    private readonly onHeldChange: (held: number[]) => void,
  ) {}

  start(): void {
    this.cleanups.push(
      this.connection.onNote((e) => {
        if (e.type === 'on') this.trail.noteOn(e.pitch, e.velocity, e.timeMs);
        else this.trail.noteOff(e.pitch, e.timeMs);
      }),
    );
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(this.canvas);
    this.cleanups.push(() => resize.disconnect());
    const input = new KeyboardInput(
      this.canvas,
      () => (this.layout ? { layout: this.layout, cssWidth: this.cssWidth, cssHeight: this.cssHeight } : null),
      (type, pitch) => this.touch(type, pitch),
    );
    this.cleanups.push(input.attach());
    // Leaving or closing the app must not leave notes hanging on the piano.
    const onPageHide = () => this.connection.send({ type: 'allNotesOff' });
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
    this.connection.send({ type: 'allNotesOff' });
  }

  setNoteLabel(noteLabel: ((pitch: number) => string) | null): void {
    this.noteLabel = noteLabel;
  }

  /** Touch and PC-keyboard notes: shown like any other and sounded on the piano. */
  private touch(type: 'on' | 'off', pitch: number): void {
    this.connection.emitVirtual({ type, pitch, velocity: TOUCH_VELOCITY, timeMs: performance.now() });
    if (type === 'on') {
      this.connection.send({ type: 'noteOn', pitch, velocity: Math.round(TOUCH_VELOCITY * 127) });
    } else {
      this.connection.send({ type: 'noteOff', pitch });
    }
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
    const notes = this.trail.visible(nowMs);
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
      notes,
      nowMs,
      noteLabel: this.noteLabel,
    });
  }
}
