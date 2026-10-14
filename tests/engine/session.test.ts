import { describe, expect, it } from 'vitest';
import { PracticeSession } from '../../src/engine/session';
import type { SessionConfig } from '../../src/engine/types';
import { pn } from '../helpers/make-midi';

const MEASURES = [0, 2, 4, 6, 8];

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { mode: 'tempo', practice: 'none', speed: 1, loop: null, soundOn: true, volume: 1, ...overrides };
}

describe('PracticeSession: playback', () => {
  it('starts 2 s before the first note and plays everything when just listening', () => {
    const s = new PracticeSession([pn(60, 0, 1, 'right'), pn(48, 1, 1, 'left')], MEASURES, config(), 0);
    expect(s.getState().songTime).toBe(-2);
    expect(s.drainOutput()).toEqual([]);
    s.tick(2000);
    expect(s.getState().songTime).toBe(0);
    expect(s.drainOutput()).toEqual([{ type: 'noteOn', pitch: 60, velocity: 102 }]);
    s.tick(3000);
    expect(s.drainOutput()).toEqual([
      { type: 'noteOff', pitch: 60 },
      { type: 'noteOn', pitch: 48, velocity: 102 },
    ]);
  });

  it('finishes one second after the last note ends and silences the piano', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config(), 0);
    s.tick(10_000);
    const state = s.getState();
    expect(state.status).toBe('finished');
    expect(state.songTime).toBe(2);
    expect(state.complete).toBe(true);
    expect(s.drainOutput().at(-1)).toEqual({ type: 'allNotesOff' });
  });

  it('only plays the hands that are not being practised', () => {
    const notes = [pn(72, 0, 1, 'right'), pn(48, 0, 1, 'left'), pn(60, 0, 1, 'accompaniment')];
    const s = new PracticeSession(notes, MEASURES, config({ practice: 'right' }), 0);
    s.tick(2000);
    expect(s.drainOutput()).toEqual([
      { type: 'noteOn', pitch: 48, velocity: 102 },
      { type: 'noteOn', pitch: 60, velocity: 102 },
    ]);
  });

  it('sends nothing when sound is off', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config({ soundOn: false }), 0);
    s.tick(2500);
    expect(s.drainOutput()).toEqual([]);
  });

  it('turning sound off mid-song silences the piano', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config(), 0);
    s.tick(2500);
    s.drainOutput();
    s.setSound(false, 1);
    expect(s.drainOutput()).toEqual([{ type: 'allNotesOff' }]);
  });

  it('runs at the configured speed, lead-in included', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config({ speed: 0.5 }), 0);
    expect(s.getState().songTime).toBe(-1);
    s.tick(2000);
    expect(s.getState().songTime).toBe(0);
  });

  it('changing speed keeps the current position', () => {
    const s = new PracticeSession([pn(60, 0, 4)], MEASURES, config(), 0);
    s.tick(2000);
    s.setSpeed(0.5, 3000);
    expect(s.getState().songTime).toBe(1);
    s.tick(5000);
    expect(s.getState().songTime).toBe(2);
    s.setSpeed(9, 5000);
    expect(s.getState().speed).toBe(1.5);
  });

  it('pause freezes time and silences; resume continues from the same point', () => {
    const s = new PracticeSession([pn(60, 0, 4)], MEASURES, config(), 0);
    s.tick(3000);
    s.drainOutput();
    s.pause(3000);
    expect(s.drainOutput()).toEqual([{ type: 'allNotesOff' }]);
    s.tick(9000);
    expect(s.getState()).toMatchObject({ status: 'paused', songTime: 1 });
    s.resume(9000);
    s.tick(9500);
    expect(s.getState()).toMatchObject({ status: 'playing', songTime: 1.5 });
  });

  it('seek moves playback and the run no longer counts as complete', () => {
    const s = new PracticeSession([pn(60, 0, 1), pn(64, 3, 1)], MEASURES, config(), 0);
    s.seek(2.5, 0);
    expect(s.drainOutput()).toEqual([{ type: 'allNotesOff' }]);
    s.tick(500);
    expect(s.drainOutput()).toEqual([{ type: 'noteOn', pitch: 64, velocity: 102 }]);
    s.tick(10_000);
    expect(s.getState()).toMatchObject({ status: 'finished', complete: false });
  });

  it('marks keys pressed while just listening as neutral', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config(), 0);
    s.noteOn(61, 0.5, 100);
    expect(s.getState().pressed.get(61)).toBe('neutral');
    s.noteOff(61, 200);
    expect(s.getState().pressed.has(61)).toBe(false);
  });
});

describe('PracticeSession: scrubbing', () => {
  it('holds the song silently while dragged and plays on from there', () => {
    const s = new PracticeSession([pn(60, 0, 1), pn(64, 3, 1)], MEASURES, config(), 0);
    s.tick(2500);
    s.drainOutput();
    s.scrub(1, 2500);
    expect(s.getState()).toMatchObject({ status: 'paused', songTime: 1.5 });
    expect(s.drainOutput()).toEqual([{ type: 'allNotesOff' }]);
    s.scrub(0.5, 3000);
    s.tick(5000);
    expect(s.getState()).toMatchObject({ status: 'paused', songTime: 2 });
    // The notes were already silenced when the drag started.
    expect(s.drainOutput()).toEqual([]);
    s.endScrub(5000);
    s.tick(6000);
    expect(s.getState()).toMatchObject({ status: 'playing', songTime: 3 });
    expect(s.drainOutput()).toEqual([{ type: 'noteOn', pitch: 64, velocity: 102 }]);
    s.tick(20_000);
    expect(s.getState()).toMatchObject({ status: 'finished', complete: false });
  });

  it('stays paused after the drag when it was paused before', () => {
    const s = new PracticeSession([pn(60, 0, 4)], MEASURES, config(), 0);
    s.pause(2500);
    s.scrub(-1, 3000);
    s.endScrub(3000);
    s.tick(4000);
    expect(s.getState()).toMatchObject({ status: 'paused', songTime: -0.5 });
  });

  it('stops at the start of the lead-in and at the end', () => {
    const s = new PracticeSession([pn(60, 0, 4)], MEASURES, config(), 0);
    s.scrub(-100, 0);
    expect(s.getState().songTime).toBe(-2);
    s.scrub(100, 0);
    expect(s.getState().songTime).toBe(5);
    s.scrub(-1, 0);
    expect(s.getState().songTime).toBe(4);
  });

  it('stays inside an active loop', () => {
    const s = new PracticeSession([pn(60, 0, 8)], MEASURES, config({ loop: { startMeasure: 1, endMeasure: 1 } }), 0);
    s.scrub(-10, 0);
    expect(s.getState().songTime).toBe(0);
    s.scrub(10, 0);
    expect(s.getState()).toMatchObject({ songTime: 4, loopPass: 0 });
  });

  it('does nothing once the run has finished', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config(), 0);
    s.tick(10_000);
    s.scrub(-1, 10_000);
    s.endScrub(10_000);
    expect(s.getState()).toMatchObject({ status: 'finished', songTime: 2 });
  });

  it('leaves a waiting step and waits again when played back to it', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config({ mode: 'wait', practice: 'right' }), 0);
    s.tick(2500);
    expect(s.getState()).toMatchObject({ status: 'waiting', songTime: 0 });
    s.scrub(-1, 2500);
    expect(s.getState()).toMatchObject({ status: 'paused', songTime: -1 });
    expect(s.getState().expected.size).toBe(0);
    s.endScrub(2500);
    s.tick(4000);
    expect(s.getState()).toMatchObject({ status: 'waiting', songTime: 0 });
  });
});

describe('PracticeSession: A–B loop', () => {
  it('starts one measure before A and wraps back after B', () => {
    const notes = [pn(60, 0.5, 0.5), pn(64, 2.5, 0.5), pn(67, 6.5, 0.5)];
    const s = new PracticeSession(notes, MEASURES, config({ loop: { startMeasure: 1, endMeasure: 1 } }), 0);
    expect(s.getState().songTime).toBe(0);
    s.tick(3900);
    expect(s.getState()).toMatchObject({ songTime: 3.9, loopPass: 0 });
    s.tick(4100);
    expect(s.getState()).toMatchObject({ songTime: 0, loopPass: 1, complete: false });
  });

  it('judges only notes inside the loop and scores each pass', () => {
    const notes = [pn(60, 0.5, 0.5), pn(64, 2.5, 0.5)];
    const s = new PracticeSession(
      notes,
      MEASURES,
      config({ mode: 'wait', practice: 'right', loop: { startMeasure: 1, endMeasure: 1 } }),
      0,
    );
    s.tick(1000);
    expect(s.getState().status).toBe('playing');
    s.tick(2600);
    expect(s.getState()).toMatchObject({ status: 'waiting', songTime: 2.5 });
    s.noteOn(64, 0.8, 2600);
    s.tick(4200);
    const state = s.getState();
    expect(state.loopPass).toBe(1);
    expect(state.lastLoopScore).toMatchObject({ kind: 'wait', totalSteps: 1, cleanSteps: 1 });
    expect(state.score).toMatchObject({ completedSteps: 0 });
  });

  it('setting a loop elsewhere jumps to its lead-in; clearing it keeps the position', () => {
    const s = new PracticeSession([pn(60, 0, 8)], MEASURES, config(), 0);
    s.tick(2500);
    s.setLoop({ startMeasure: 2, endMeasure: 3 }, 2500);
    expect(s.getState().songTime).toBe(2);
    s.tick(3000);
    s.setLoop(null, 3000);
    expect(s.getState()).toMatchObject({ songTime: 2.5, loop: null });
  });

  it('seeking outside an active loop jumps to the loop restart', () => {
    const s = new PracticeSession([pn(60, 0, 8)], MEASURES, config({ loop: { startMeasure: 1, endMeasure: 1 } }), 0);
    s.seek(6, 0);
    expect(s.getState()).toMatchObject({ songTime: 0, loopPass: 0 });
    s.seek(3, 0);
    expect(s.getState().songTime).toBe(3);
  });

  it('setting a loop on a finished run starts playing again at its restart', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config(), 0);
    s.tick(10_000);
    expect(s.getState().status).toBe('finished');
    s.setLoop({ startMeasure: 0, endMeasure: 3 }, 10_000);
    expect(s.getState()).toMatchObject({ status: 'playing', songTime: -2 });
  });

  it('getState returns a copy of the score', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config({ practice: 'right' }), 0);
    const score = s.getState().score!;
    expect(s.getState().score).not.toBe(score);
    expect(s.getState().score).toEqual(score);
  });
});

describe('PracticeSession: loop edges', () => {
  const loop = { startMeasure: 1, endMeasure: 1 };

  it('tempo: keeps judging after B so a late press still hits, and plays nothing past B', () => {
    const notes = [pn(60, 3.95, 0.05, 'right'), pn(48, 4.05, 0.5, 'left')];
    const s = new PracticeSession(notes, MEASURES, config({ practice: 'right', loop }), 0);
    s.tick(4120);
    s.noteOn(60, 0.8, 4050);
    expect(s.getState().pressed.get(60)).toBe('right');
    expect(s.drainOutput().some((e) => e.type === 'noteOn' && e.pitch === 48)).toBe(false);
    s.tick(4300);
    const state = s.getState();
    expect(state.loopPass).toBe(1);
    expect(state.lastLoopScore).toMatchObject({ kind: 'tempo', hits: 1, misses: 0, extras: 0 });
    expect(state.score).toMatchObject({ hits: 0, misses: 0, extras: 0 });
  });

  it('wait: a press during the lead-in is neutral and does not spoil the first step', () => {
    const s = new PracticeSession(
      [pn(64, 2.5, 0.5)],
      MEASURES,
      config({ mode: 'wait', practice: 'right', loop }),
      0,
    );
    s.tick(1000);
    s.noteOn(64, 0.8, 1000);
    expect(s.getState().pressed.get(64)).toBe('neutral');
    s.noteOff(64, 1100);
    s.tick(2600);
    s.noteOn(64, 0.8, 2600);
    expect(s.getState().score).toMatchObject({ wrongNotes: 0, cleanSteps: 1 });
  });

  it('tempo: a press during the lead-in is neutral and counts no extra', () => {
    const s = new PracticeSession([pn(64, 2.5, 0.5)], MEASURES, config({ practice: 'right', loop }), 0);
    s.tick(1000);
    s.noteOn(64, 0.8, 1000);
    expect(s.getState().pressed.get(64)).toBe('neutral');
    expect(s.getState().score).toMatchObject({ extras: 0 });
  });

  it('tempo: never starts an auto note at B, but still ends notes inside the loop on time', () => {
    const notes = [pn(64, 2.5, 0.2, 'right'), pn(50, 3, 0.9, 'left'), pn(48, 4, 0.5, 'left')];
    const s = new PracticeSession(notes, MEASURES, config({ practice: 'right', loop }), 0);
    s.tick(3950);
    expect(s.drainOutput()).toContainEqual({ type: 'noteOff', pitch: 50 });
    s.tick(4100);
    expect(s.drainOutput().some((e) => e.type === 'noteOn' && e.pitch === 48)).toBe(false);
    s.tick(4300);
    expect(s.getState().loopPass).toBe(1);
    expect(s.drainOutput().some((e) => e.type === 'noteOn' && e.pitch === 48)).toBe(false);
  });

  it('clearing the loop during the tail does not burst the notes skipped past B', () => {
    const notes = [pn(64, 2.5, 0.2, 'right'), pn(55, 4.05, 0.1, 'left')];
    const s = new PracticeSession(notes, MEASURES, config({ practice: 'right', loop }), 0);
    s.tick(4100);
    s.drainOutput();
    s.setLoop(null, 4100);
    s.tick(4120);
    expect(s.drainOutput().some((e) => e.type === 'noteOn')).toBe(false);
  });
});
