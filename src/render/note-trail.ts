export interface TrailNote {
  pitch: number;
  /** 0–1 */
  velocity: number;
  /** performance.now() base */
  startMs: number;
  /** null while the key is still held */
  endMs: number | null;
}

/** What was played in free play: held notes grow, released ones rise off the screen. */
export class NoteTrail {
  private notes: TrailNote[] = [];
  private open = new Map<number, TrailNote>();

  noteOn(pitch: number, velocity: number, timeMs: number): void {
    this.noteOff(pitch, timeMs);
    const note: TrailNote = { pitch, velocity, startMs: timeMs, endMs: null };
    this.notes.push(note);
    this.open.set(pitch, note);
  }

  noteOff(pitch: number, timeMs: number): void {
    const note = this.open.get(pitch);
    if (!note) return;
    note.endMs = timeMs;
    this.open.delete(pitch);
  }

  releaseAll(timeMs: number): void {
    for (const pitch of [...this.open.keys()]) this.noteOff(pitch, timeMs);
  }

  /** Pitches currently held, ascending. */
  held(): number[] {
    return [...this.open.keys()].sort((a, b) => a - b);
  }

  /** Notes still on screen at nowMs with `seconds` shown (drops released notes that have risen off the top). */
  visible(nowMs: number, seconds: number): readonly TrailNote[] {
    const limit = nowMs - seconds * 1000;
    let kept = 0;
    for (const n of this.notes) if (n.endMs === null || n.endMs > limit) this.notes[kept++] = n;
    this.notes.length = kept;
    return this.notes;
  }
}
