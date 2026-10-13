import type { SessionState } from '../engine/types';

/**
 * Song time a restarted run (e.g. after a hand change) should continue from,
 * or null to start fresh: the position is kept only while the run is under way.
 */
export function restartPosition(state: SessionState, firstNoteStart: number): number | null {
  if (state.status === 'finished' || state.songTime <= firstNoteStart) return null;
  return state.songTime;
}
