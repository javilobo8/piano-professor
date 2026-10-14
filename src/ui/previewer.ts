import { PracticeSession } from '../engine/session';
import type { SoundSink } from '../audio/sound-output';
import type { PlayableNote } from '../song/types';

/** Plays notes without judging (song or single-track preview) through the sound output. */
export class Previewer {
  private session: PracticeSession | null = null;
  private frame = 0;

  constructor(private readonly output: SoundSink) {}

  get playing(): boolean {
    return this.session !== null;
  }

  play(notes: readonly PlayableNote[], measures: readonly number[], volume: number, onEnd: () => void): void {
    this.stop();
    if (notes.length === 0) {
      onEnd();
      return;
    }
    const now = performance.now();
    const session = new PracticeSession(
      notes,
      measures,
      { mode: 'tempo', practice: 'none', speed: 1, loop: null, soundOn: true, volume },
      now,
    );
    session.seek(notes[0].start - 0.05, now);
    this.session = session;
    const step = () => {
      session.tick(performance.now());
      for (const event of session.drainOutput()) this.output.send(event);
      if (session.getState().status === 'finished') {
        this.stop();
        onEnd();
        return;
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    if (this.session) {
      this.session = null;
      this.output.send({ type: 'allNotesOff' });
    }
  }
}
