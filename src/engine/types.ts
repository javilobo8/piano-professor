export type Mode = 'wait' | 'tempo';
/** 'none' = just listen: nothing is required, everything is played automatically. */
export type Practice = 'right' | 'left' | 'both' | 'none';

export interface LoopRange {
  /** 0-based, inclusive. */
  startMeasure: number;
  /** 0-based, inclusive. */
  endMeasure: number;
}

export interface SessionConfig {
  mode: Mode;
  practice: Practice;
  /** 0.25–1.5 */
  speed: number;
  loop: LoopRange | null;
  soundOn: boolean;
  /** 0–1, scales the velocity of notes sent to the piano. */
  volume: number;
}

export type OutputEvent =
  | { type: 'noteOn'; pitch: number; velocity: number } // velocity 1–127
  | { type: 'noteOff'; pitch: number }
  | { type: 'allNotesOff' };

export type Status = 'playing' | 'waiting' | 'paused' | 'finished';

/** Colour of a pressed key: the hand it matched, a wrong press, or no judging. */
export type KeyResult = 'right' | 'left' | 'wrong' | 'neutral';

export interface WaitScore {
  kind: 'wait';
  totalSteps: number;
  completedSteps: number;
  cleanSteps: number;
  wrongNotes: number;
  elapsedMs: number;
}

export interface TempoScore {
  kind: 'tempo';
  hits: number;
  perfects: number;
  misses: number;
  extras: number;
  streak: number;
  bestStreak: number;
}

export type Score = WaitScore | TempoScore;

export interface SessionState {
  songTime: number;
  status: Status;
  speed: number;
  loop: LoopRange | null;
  /** Keys currently held, with their colour. */
  pressed: Map<number, KeyResult>;
  /** Wait mode: pitches still needed while the song is waiting. */
  expected: Set<number>;
  /** null when practice is 'none'. */
  score: Score | null;
  /** How many times the loop has restarted. */
  loopPass: number;
  /** Score of the last finished loop pass. */
  lastLoopScore: Score | null;
  /** True once finished, if the run was never seeked nor looped. */
  complete: boolean;
}
