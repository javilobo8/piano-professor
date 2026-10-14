import type { PlayableNote, PlayRole } from '../song/types';
import { AutoPlayer } from './auto-player';
import { HIT_WINDOW_SECONDS, MISS_GRACE_SECONDS, TempoJudge } from './tempo-judge';
import type {
  KeyResult,
  LoopRange,
  OutputEvent,
  Practice,
  Score,
  SessionConfig,
  SessionState,
  Status,
} from './types';
import { EARLY_PRESS_SECONDS, WaitJudge } from './wait-judge';

/** Real seconds of falling notes before the first note of the song. */
export const LEAD_IN_SECONDS = 2;
/** Song seconds after the last note ends before the session finishes. */
export const END_PADDING_SECONDS = 1;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 1.5;

interface LoopBounds {
  start: number;
  end: number;
  /** Where each pass restarts: one measure before `start`. */
  restart: number;
}

export function practicedRoles(practice: Practice): Set<PlayRole> {
  switch (practice) {
    case 'right':
      return new Set(['right']);
    case 'left':
      return new Set(['left']);
    case 'both':
      return new Set(['right', 'left']);
    case 'none':
      return new Set();
  }
}

export function clampSpeed(speed: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

/**
 * One practice run over a song. Pure logic: the caller feeds wall-clock time
 * (ms, same base as performance.now()) and key presses, renders getState()
 * and sends drainOutput() to the piano.
 */
export class PracticeSession {
  private readonly config: SessionConfig;
  private readonly auto: AutoPlayer;
  private readonly wait: WaitJudge | null;
  private readonly tempo: TempoJudge | null;
  private readonly startTime: number;
  private readonly endTime: number;
  /** Start of the first required note, or -Infinity when nothing is required. */
  private readonly firstRequired: number;
  private songTime = 0;
  private lastWallMs: number;
  private status: Status = 'playing';
  private resumeStatus: 'playing' | 'waiting' = 'playing';
  private out: OutputEvent[] = [];
  private pressed = new Map<number, KeyResult>();
  private loopPass = 0;
  private lastLoopScore: Score | null = null;
  private pristine = true;
  /** Song time up to which the auto player has been advanced. */
  private autoTime = 0;
  /** While the player drags the song: whether it plays on when the drag ends. */
  private scrubResume: boolean | null = null;

  constructor(
    notes: readonly PlayableNote[],
    private readonly measures: readonly number[],
    config: SessionConfig,
    nowMs: number,
  ) {
    this.config = { ...config, speed: clampSpeed(config.speed) };
    const practiced = practicedRoles(config.practice);
    const required = notes.filter((n) => practiced.has(n.role));
    const first = required.reduce((min, n) => Math.min(min, n.start), Infinity);
    this.firstRequired = first === Infinity ? -Infinity : first;
    this.auto = new AutoPlayer(notes.filter((n) => !practiced.has(n.role)));
    const judging = config.practice !== 'none';
    this.wait = judging && config.mode === 'wait' ? new WaitJudge(required) : null;
    this.tempo = judging && config.mode === 'tempo' ? new TempoJudge(required) : null;
    this.startTime = (notes[0]?.start ?? 0) - LEAD_IN_SECONDS * this.config.speed;
    this.endTime = notes.reduce((max, n) => Math.max(max, n.end), 0) + END_PADDING_SECONDS;
    this.lastWallMs = nowMs;
    const loop = this.loopBounds();
    if (loop) this.pristine = false;
    this.jumpTo(loop ? loop.restart : this.startTime);
    this.out = [];
  }

  tick(nowMs: number): void {
    const dtMs = Math.max(0, nowMs - this.lastWallMs);
    this.lastWallMs = Math.max(this.lastWallMs, nowMs);
    if (this.status === 'paused' || this.status === 'finished') return;
    this.wait?.addElapsed(dtMs);
    if (this.status === 'waiting') return;
    this.advanceSong(this.songTime + (dtMs / 1000) * this.config.speed);
  }

  noteOn(pitch: number, _velocity: number, timeMs: number): void {
    if (timeMs > this.lastWallMs) this.tick(timeMs);
    if (this.status === 'paused' || this.status === 'finished' || (!this.wait && !this.tempo)) {
      this.pressed.set(pitch, 'neutral');
      return;
    }
    const lagSeconds = Math.max(0, this.lastWallMs - timeMs) / 1000;
    const waiting = this.status === 'waiting';
    const eventTime = waiting ? this.songTime : this.songTime - lagSeconds * this.config.speed;
    // Presses before the judged range (lead-in to the song or to the loop) are not judged.
    const loop = this.loopBounds();
    const rangeStart = loop ? loop.start : this.firstRequired;
    const tolerance = (this.wait ? EARLY_PRESS_SECONDS : HIT_WINDOW_SECONDS) * this.config.speed;
    if (eventTime < rangeStart - tolerance) {
      this.pressed.set(pitch, 'neutral');
      return;
    }
    let result: KeyResult;
    if (this.wait) {
      const secondsUntilStep = Math.max(0, (this.wait.holdTime - eventTime) / this.config.speed);
      const judged = this.wait.press(pitch, secondsUntilStep);
      result = judged.result;
      if (judged.completed && waiting) {
        this.status = 'playing';
        // Release the other hand's notes held back at this step, right after the pianist's key.
        this.moveTo(this.songTime);
      }
    } else {
      result = this.tempo!.press(pitch, eventTime, this.config.speed);
    }
    this.pressed.set(pitch, result);
  }

  noteOff(pitch: number, _timeMs: number): void {
    this.pressed.delete(pitch);
  }

  pause(nowMs: number): void {
    this.tick(nowMs);
    if (this.status !== 'playing' && this.status !== 'waiting') return;
    this.resumeStatus = this.status;
    this.status = 'paused';
    this.auto.silence();
    this.out.push({ type: 'allNotesOff' });
  }

  resume(nowMs: number): void {
    if (this.status !== 'paused') return;
    this.status = this.resumeStatus;
    this.lastWallMs = nowMs;
  }

  /** Jumps to song time t. The run no longer counts as complete. */
  seek(t: number, nowMs: number): void {
    this.tick(nowMs);
    this.lastWallMs = nowMs;
    this.pristine = false;
    let target = Math.min(this.endTime, Math.max(Math.min(0, this.startTime), t));
    const loop = this.loopBounds();
    if (loop && (target < loop.restart || target >= loop.end)) target = loop.restart;
    this.jumpTo(target);
  }

  /**
   * Moves the song by `seconds` as the player drags it. It is held still and silent until
   * endScrub(). The run no longer counts as complete. Does nothing once the run has finished.
   */
  scrub(seconds: number, nowMs: number): void {
    if (this.holdForScrub(nowMs)) this.scrubJump(this.songTime + seconds);
  }

  /** Like scrub(), but drags the song straight to song time t (the progress bar). */
  scrubTo(t: number, nowMs: number): void {
    if (this.holdForScrub(nowMs)) this.scrubJump(t);
  }

  /** The drag ended: the song plays on if it was playing when the drag started. */
  endScrub(nowMs: number): void {
    const resume = this.scrubResume;
    this.scrubResume = null;
    if (resume) this.resume(nowMs);
  }

  setSpeed(speed: number, nowMs: number): void {
    this.tick(nowMs);
    this.config.speed = clampSpeed(speed);
  }

  /** Sets or clears the A–B loop. The run no longer counts as complete. */
  setLoop(loop: LoopRange | null, nowMs: number): void {
    this.tick(nowMs);
    this.config.loop = loop;
    this.pristine = false;
    const bounds = this.loopBounds();
    if (bounds && (this.status === 'finished' || this.songTime < bounds.restart || this.songTime >= bounds.end)) {
      this.jumpTo(bounds.restart);
    } else {
      if (this.songTime > this.autoTime) {
        // Left the old loop's tail: skip what was held back instead of playing it all at once.
        this.autoTime = this.songTime;
        this.auto.reset(this.songTime);
        this.out.push({ type: 'allNotesOff' });
      }
      this.resetJudges(this.songTime);
      if (this.status === 'waiting') this.status = 'playing';
    }
  }

  setSound(soundOn: boolean, volume: number): void {
    const wasAudible = this.audible;
    this.config.soundOn = soundOn;
    this.config.volume = volume;
    if (wasAudible && !this.audible) {
      this.auto.silence();
      this.out.push({ type: 'allNotesOff' });
    }
  }

  getState(): SessionState {
    return {
      songTime: this.songTime,
      status: this.status,
      speed: this.config.speed,
      loop: this.config.loop,
      pressed: new Map(this.pressed),
      expected: new Set(this.status === 'waiting' && this.wait ? this.wait.pending : []),
      score: this.currentScore(),
      loopPass: this.loopPass,
      lastLoopScore: this.lastLoopScore,
      complete: this.pristine && this.status === 'finished',
    };
  }

  /** Events for the piano since the last call. */
  drainOutput(): OutputEvent[] {
    const out = this.out;
    this.out = [];
    return out;
  }

  private get audible(): boolean {
    return this.config.soundOn && this.config.volume > 0;
  }

  private advanceSong(target: number): void {
    if (this.wait && this.wait.holdTime <= target) {
      this.moveTo(Math.max(this.songTime, this.wait.holdTime));
      this.status = 'waiting';
      return;
    }
    const loop = this.loopBounds();
    // Tempo mode keeps judging for the late half of the hit window past B.
    const tail = this.tempo ? (HIT_WINDOW_SECONDS + MISS_GRACE_SECONDS) * this.config.speed : 0;
    if (loop && target >= loop.end + tail) {
      this.moveTo(loop.end + tail);
      this.tempo?.finalize();
      this.loopPass++;
      this.lastLoopScore = this.currentScore();
      this.jumpTo(loop.restart);
      return;
    }
    if (!loop && target >= this.endTime) {
      this.moveTo(this.endTime);
      this.tempo?.finalize();
      this.status = 'finished';
      this.auto.silence();
      this.out.push({ type: 'allNotesOff' });
      return;
    }
    this.moveTo(target);
  }

  private currentScore(): Score | null {
    const score = this.wait?.score ?? this.tempo?.score ?? null;
    return score ? { ...score } : null;
  }

  private moveTo(t: number): void {
    const audible = this.audible;
    const loop = this.loopBounds();
    const autoTarget = loop ? Math.min(t, loop.end) : t;
    // Wait mode: notes at or after the step the clock holds at start only once it is played.
    const startLimit = Math.min(loop ? loop.end : Infinity, this.wait ? this.wait.holdTime : Infinity);
    this.auto.advanceTo(
      autoTarget,
      this.config.volume,
      (e) => {
        if (audible) this.out.push(e);
      },
      startLimit,
    );
    this.autoTime = Math.max(this.autoTime, autoTarget);
    this.tempo?.advanceTo(t, this.config.speed);
    this.songTime = t;
  }

  private jumpTo(t: number, silence = true): void {
    this.songTime = t;
    this.autoTime = t;
    this.auto.reset(t);
    if (silence) this.out.push({ type: 'allNotesOff' });
    this.resetJudges(t);
    if (this.status !== 'paused') this.status = 'playing';
    this.resumeStatus = 'playing';
  }

  private resetJudges(from: number): void {
    const loop = this.loopBounds();
    const start = loop ? Math.max(from, loop.start) : from;
    const end = loop ? loop.end : Infinity;
    this.wait?.reset(start, end);
    this.tempo?.reset(start, end);
  }

  /** Holds the song still and silent when a drag starts. False once the run has finished. */
  private holdForScrub(nowMs: number): boolean {
    if (this.scrubResume !== null) return true;
    this.tick(nowMs);
    if (this.status === 'finished') return false;
    this.scrubResume = this.status !== 'paused';
    this.pause(nowMs);
    return true;
  }

  private scrubJump(t: number): void {
    const { min, max } = this.scrubRange();
    this.pristine = false;
    // The pause already silenced the piano.
    this.jumpTo(Math.min(max, Math.max(min, t)), false);
  }

  /** Where a drag can take the song: from the lead-in to the end, or within the active loop. */
  private scrubRange(): { min: number; max: number } {
    const loop = this.loopBounds();
    return loop ? { min: loop.restart, max: loop.end } : { min: Math.min(0, this.startTime), max: this.endTime };
  }

  private loopBounds(): LoopBounds | null {
    const loop = this.config.loop;
    const count = this.measures.length - 1;
    if (!loop || count < 1) return null;
    const first = Math.min(Math.max(0, loop.startMeasure), count - 1);
    const last = Math.min(Math.max(first, loop.endMeasure), count - 1);
    const start = this.measures[first];
    const leadIn = this.measures[first + 1] - start;
    return { start, end: this.measures[last + 1], restart: start - leadIn };
  }
}
