import type { PlayableNote } from '../song/types';
import { lowerBound } from '../util/bisect';
import type { OutputEvent } from './types';

/** Turns the notes nobody has to play into noteOn/noteOff events as song time passes. */
export class AutoPlayer {
  private next = 0;
  private sounding: { pitch: number; end: number }[] = [];
  private counts = new Map<number, number>();

  constructor(private readonly notes: readonly PlayableNote[]) {}

  /** Positions playback at t: notes starting before t are skipped. Caller sends allNotesOff. */
  reset(t: number): void {
    this.next = lowerBound(this.notes, t);
    this.silence();
  }

  /** Forgets sounding notes without moving the playback position. Caller sends allNotesOff. */
  silence(): void {
    this.sounding = [];
    this.counts.clear();
  }

  /** Emits every note start/end up to and including song time t, in time order. */
  advanceTo(t: number, volume: number, emit: (e: OutputEvent) => void): void {
    for (;;) {
      const startNote = this.next < this.notes.length ? this.notes[this.next] : null;
      const startTime = startNote ? startNote.start : Infinity;
      const endIndex = this.earliestEnd();
      const endTime = endIndex >= 0 ? this.sounding[endIndex].end : Infinity;
      if (Math.min(startTime, endTime) > t) return;

      if (endTime <= startTime) {
        const [{ pitch }] = this.sounding.splice(endIndex, 1);
        const count = (this.counts.get(pitch) ?? 1) - 1;
        if (count <= 0) {
          this.counts.delete(pitch);
          emit({ type: 'noteOff', pitch });
        } else {
          this.counts.set(pitch, count);
        }
      } else {
        const note = startNote!;
        this.next++;
        const count = this.counts.get(note.pitch) ?? 0;
        if (count > 0) emit({ type: 'noteOff', pitch: note.pitch });
        this.counts.set(note.pitch, count + 1);
        this.sounding.push({ pitch: note.pitch, end: note.end });
        const velocity = Math.max(1, Math.min(127, Math.round(note.velocity * 127 * volume)));
        emit({ type: 'noteOn', pitch: note.pitch, velocity });
      }
    }
  }

  private earliestEnd(): number {
    let best = -1;
    for (let i = 0; i < this.sounding.length; i++) {
      if (best < 0 || this.sounding[i].end < this.sounding[best].end) best = i;
    }
    return best;
  }
}
