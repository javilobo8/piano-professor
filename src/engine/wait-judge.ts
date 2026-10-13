import { buildSteps, type Step } from '../song/steps';
import type { PlayableNote } from '../song/types';
import { emptyWaitScore } from './scoring';
import type { KeyResult, WaitScore } from './types';

/** A press up to this many real seconds before the song reaches a step counts for it. */
export const EARLY_PRESS_SECONDS = 0.1;

/** Wait mode: the song stops at each step until all its keys are pressed. */
export class WaitJudge {
  private steps: Step[] = [];
  private index = 0;
  private done = new Set<number>();
  private dirty = false;
  score: WaitScore = emptyWaitScore(0);

  constructor(private readonly required: readonly PlayableNote[]) {}

  /** Judges only steps starting in [from, to). Resets the score. */
  reset(from: number, to: number): void {
    this.steps = buildSteps(this.required.filter((n) => n.start >= from && n.start < to));
    this.index = 0;
    this.done.clear();
    this.dirty = false;
    this.score = emptyWaitScore(this.steps.length);
  }

  /** Song time where the clock must stop, or Infinity when no steps remain. */
  get holdTime(): number {
    return this.index < this.steps.length ? this.steps[this.index].time : Infinity;
  }

  /** Pitches of the current step not pressed yet. */
  get pending(): number[] {
    const step = this.steps[this.index];
    if (!step) return [];
    return [...new Set(step.notes.map((n) => n.pitch))].filter((p) => !this.done.has(p));
  }

  /**
   * Judges a key press made `secondsUntilStep` real seconds before the song
   * reaches the current step (0 while waiting at it).
   */
  press(pitch: number, secondsUntilStep: number): { result: KeyResult; completed: boolean } {
    const step = this.steps[this.index];
    const note = step?.notes.find((n) => n.pitch === pitch);
    if (!step || !note || secondsUntilStep > EARLY_PRESS_SECONDS) {
      this.score.wrongNotes++;
      this.dirty = true;
      return { result: 'wrong', completed: false };
    }
    this.done.add(pitch);
    const completed = step.notes.every((n) => this.done.has(n.pitch));
    if (completed) {
      this.score.completedSteps++;
      if (!this.dirty) this.score.cleanSteps++;
      this.index++;
      this.done.clear();
      this.dirty = false;
    }
    return { result: note.role === 'left' ? 'left' : 'right', completed };
  }

  addElapsed(ms: number): void {
    this.score.elapsedMs += ms;
  }
}
