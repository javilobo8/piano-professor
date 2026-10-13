import type { PlayableNote } from '../song/types';
import { lowerBound } from '../util/bisect';
import { emptyTempoScore } from './scoring';
import type { KeyResult, TempoScore } from './types';

/** Real seconds either side of a note's start in which a press is a hit. */
export const HIT_WINDOW_SECONDS = 0.15;
/** Real seconds either side of a note's start in which a hit is perfect. */
export const PERFECT_WINDOW_SECONDS = 0.05;
/** Extra real seconds before an unplayed note counts as missed (absorbs MIDI delivery lag). */
export const MISS_GRACE_SECONDS = 0.1;

/** Tempo mode: the song never stops; presses are matched to notes by timing. */
export class TempoJudge {
  private notes: PlayableNote[] = [];
  private matched = new Set<number>();
  private cursor = 0;
  score: TempoScore = emptyTempoScore();

  constructor(private readonly required: readonly PlayableNote[]) {}

  /** Judges only notes starting in [from, to). Resets the score. */
  reset(from: number, to: number): void {
    this.notes = this.required.filter((n) => n.start >= from && n.start < to);
    this.matched.clear();
    this.cursor = 0;
    this.score = emptyTempoScore();
  }

  /** Counts as missed every unmatched note whose window closed before song time t. */
  advanceTo(t: number, speed: number): void {
    const limit = (HIT_WINDOW_SECONDS + MISS_GRACE_SECONDS) * speed;
    while (this.cursor < this.notes.length && this.notes[this.cursor].start + limit < t) {
      this.judgeMiss(this.notes[this.cursor++]);
    }
  }

  /** Counts every note not judged yet as missed (end of song or loop pass). */
  finalize(): void {
    while (this.cursor < this.notes.length) this.judgeMiss(this.notes[this.cursor++]);
  }

  /** Judges a key press made at song time t. */
  press(pitch: number, t: number, speed: number): KeyResult {
    const window = HIT_WINDOW_SECONDS * speed;
    let best: PlayableNote | null = null;
    for (
      let i = Math.max(this.cursor, lowerBound(this.notes, t - window));
      i < this.notes.length && this.notes[i].start <= t + window;
      i++
    ) {
      const n = this.notes[i];
      if (n.pitch !== pitch || this.matched.has(n.id)) continue;
      if (!best || Math.abs(n.start - t) < Math.abs(best.start - t)) best = n;
    }
    if (!best) {
      this.score.extras++;
      this.score.streak = 0;
      return 'wrong';
    }
    this.matched.add(best.id);
    this.score.hits++;
    if (Math.abs(best.start - t) / speed <= PERFECT_WINDOW_SECONDS) this.score.perfects++;
    this.score.streak++;
    this.score.bestStreak = Math.max(this.score.bestStreak, this.score.streak);
    return best.role === 'left' ? 'left' : 'right';
  }

  private judgeMiss(note: PlayableNote): void {
    if (this.matched.has(note.id)) return;
    this.score.misses++;
    this.score.streak = 0;
  }
}
