import type { PlayableNote } from './types';

/** Notes starting within this many song seconds of each other form one step (a chord). */
export const CHORD_TOLERANCE = 0.03;

export interface Step {
  /** Start of the first note in the step. */
  time: number;
  notes: PlayableNote[];
}

/** Groups notes (sorted by start) into steps. */
export function buildSteps(notes: readonly PlayableNote[]): Step[] {
  const steps: Step[] = [];
  for (const n of notes) {
    const last = steps[steps.length - 1];
    if (last && n.start - last.time <= CHORD_TOLERANCE) last.notes.push(n);
    else steps.push({ time: n.start, notes: [n] });
  }
  return steps;
}
