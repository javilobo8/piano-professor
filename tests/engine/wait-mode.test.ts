import { describe, expect, it } from 'vitest';
import { scorePercent } from '../../src/engine/scoring';
import { PracticeSession } from '../../src/engine/session';
import type { Practice } from '../../src/engine/types';
import { pn } from '../helpers/make-midi';

const MEASURES = [0, 2, 4, 6, 8];

function waitSession(notes: ReturnType<typeof pn>[], practice: Practice = 'right') {
  return new PracticeSession(
    notes,
    MEASURES,
    { mode: 'wait', practice, speed: 1, loop: null, soundOn: true, volume: 1 },
    0,
  );
}

describe('wait mode', () => {
  it('stops at the first step and shows the expected keys', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(5000);
    const state = s.getState();
    expect(state).toMatchObject({ status: 'waiting', songTime: 0 });
    expect([...state.expected]).toEqual([60]);
  });

  it('continues once the right key is pressed', () => {
    const s = waitSession([pn(60, 0, 1), pn(62, 1, 1)]);
    s.tick(5000);
    s.noteOn(60, 0.8, 5000);
    expect(s.getState().pressed.get(60)).toBe('right');
    expect(s.getState().status).toBe('playing');
    s.tick(5500);
    expect(s.getState().songTime).toBe(0.5);
    expect(s.getState().score).toMatchObject({ completedSteps: 1, cleanSteps: 1 });
  });

  it('needs every key of a chord', () => {
    const s = waitSession([pn(60, 0, 1), pn(64, 0.01, 1)]);
    s.tick(3000);
    s.noteOn(60, 0.8, 3000);
    expect(s.getState().status).toBe('waiting');
    expect([...s.getState().expected]).toEqual([64]);
    s.noteOn(64, 0.8, 3100);
    expect(s.getState().status).toBe('playing');
  });

  it('a wrong key turns red, does not advance, and spoils the step', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(3000);
    s.noteOn(61, 0.8, 3000);
    expect(s.getState().pressed.get(61)).toBe('wrong');
    expect(s.getState().status).toBe('waiting');
    s.noteOn(60, 0.8, 3200);
    expect(s.getState().score).toMatchObject({ completedSteps: 1, cleanSteps: 0, wrongNotes: 1 });
  });

  it('accepts a press up to 100 ms early', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(1950);
    s.noteOn(60, 0.8, 1950);
    s.tick(2100);
    expect(s.getState().status).toBe('playing');
    expect(s.getState().songTime).toBeCloseTo(0.1);
    expect(s.getState().score).toMatchObject({ cleanSteps: 1, wrongNotes: 0 });
  });

  it('a press 300 ms early is wrong', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(1700);
    s.noteOn(60, 0.8, 1700);
    expect(s.getState().pressed.get(60)).toBe('wrong');
    s.tick(2100);
    expect(s.getState().status).toBe('waiting');
  });

  it('holding a key does not play the next repeat of the same note', () => {
    const s = waitSession([pn(60, 0, 0.5), pn(60, 1, 0.5)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2000);
    s.tick(4000);
    expect(s.getState()).toMatchObject({ status: 'waiting', songTime: 1 });
    s.noteOff(60, 4100);
    s.noteOn(60, 0.8, 4200);
    expect(s.getState().status).toBe('playing');
  });

  it('practising the left hand waits for left-hand notes and plays the right hand', () => {
    const s = waitSession([pn(72, 0, 1, 'right'), pn(48, 0, 1, 'left')], 'left');
    s.tick(2000);
    expect(s.drainOutput()).toEqual([{ type: 'noteOn', pitch: 72, velocity: 102 }]);
    expect([...s.getState().expected]).toEqual([48]);
    s.noteOn(48, 0.8, 2100);
    expect(s.getState().pressed.get(48)).toBe('left');
  });

  it('counts elapsed time while waiting but not while paused', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(3000);
    s.pause(3000);
    s.tick(60_000);
    s.resume(60_000);
    s.tick(61_000);
    expect(s.getState().score).toMatchObject({ elapsedMs: 4000 });
  });

  it('finishes after the last step and reports a percentage', () => {
    const s = waitSession([pn(60, 0, 0.5), pn(62, 0.5, 0.5)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2000);
    s.tick(2500);
    s.noteOn(63, 0.8, 2500);
    s.noteOn(62, 0.8, 2600);
    s.tick(10_000);
    const state = s.getState();
    expect(state).toMatchObject({ status: 'finished', complete: true });
    expect(scorePercent(state.score!)).toBe(50);
  });

  it('the early-press tolerance is real time: at half speed 90 ms early counts, 150 ms is wrong', () => {
    const ok = new PracticeSession(
      [pn(60, 0, 1)],
      MEASURES,
      { mode: 'wait', practice: 'right', speed: 0.5, loop: null, soundOn: true, volume: 1 },
      0,
    );
    ok.tick(1910);
    ok.noteOn(60, 0.8, 1910);
    expect(ok.getState().pressed.get(60)).toBe('right');
    const bad = new PracticeSession(
      [pn(60, 0, 1)],
      MEASURES,
      { mode: 'wait', practice: 'right', speed: 0.5, loop: null, soundOn: true, volume: 1 },
      0,
    );
    bad.tick(1850);
    bad.noteOn(60, 0.8, 1850);
    expect(bad.getState().pressed.get(60)).toBe('wrong');
  });
});
