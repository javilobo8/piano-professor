import { describe, expect, it } from 'vitest';
import { scorePercent } from '../../src/engine/scoring';
import { PracticeSession } from '../../src/engine/session';
import { pn } from '../helpers/make-midi';

const MEASURES = [0, 2, 4, 6, 8];

function tempoSession(notes: ReturnType<typeof pn>[], speed = 1) {
  return new PracticeSession(
    notes,
    MEASURES,
    { mode: 'tempo', practice: 'both', speed, loop: null, soundOn: true, volume: 1 },
    0,
  );
}

describe('tempo mode', () => {
  it('never stops for the player', () => {
    const s = tempoSession([pn(60, 0, 1)]);
    s.tick(2500);
    expect(s.getState()).toMatchObject({ status: 'playing', songTime: 0.5 });
  });

  it('a press within 50 ms is a perfect hit', () => {
    const s = tempoSession([pn(60, 0, 1)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2040);
    expect(s.getState().pressed.get(60)).toBe('right');
    expect(s.getState().score).toMatchObject({ hits: 1, perfects: 1, streak: 1 });
  });

  it('a press within 150 ms is a hit but not perfect', () => {
    const s = tempoSession([pn(48, 0, 1, 'left')]);
    s.tick(1900);
    s.noteOn(48, 0.8, 1880);
    expect(s.getState().pressed.get(48)).toBe('left');
    expect(s.getState().score).toMatchObject({ hits: 1, perfects: 0 });
  });

  it('a press 200 ms late is an extra note, and the note is then missed', () => {
    const s = tempoSession([pn(60, 0, 1)]);
    s.tick(2200);
    s.noteOn(60, 0.8, 2200);
    expect(s.getState().pressed.get(60)).toBe('wrong');
    s.tick(2300);
    expect(s.getState().score).toMatchObject({ hits: 0, extras: 1, misses: 1 });
  });

  it('judges a press by its own timestamp even if it arrives after the frame', () => {
    const s = tempoSession([pn(60, 0, 1)]);
    s.tick(2160);
    s.noteOn(60, 0.8, 2010);
    expect(s.getState().score).toMatchObject({ hits: 1, perfects: 1 });
  });

  it('the hit window scales with speed', () => {
    const s = tempoSession([pn(60, 0, 1)], 0.5);
    // At half speed the note arrives at 2000 ms; 140 ms late is still inside ±150 ms real time.
    s.tick(2140);
    s.noteOn(60, 0.8, 2140);
    expect(s.getState().score).toMatchObject({ hits: 1 });
  });

  it('wrong keys break the streak', () => {
    const s = tempoSession([pn(60, 0, 0.5), pn(62, 0.5, 0.5), pn(64, 1, 0.5)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2000);
    s.tick(2500);
    s.noteOn(62, 0.8, 2500);
    s.noteOn(70, 0.8, 2600);
    s.tick(3000);
    s.noteOn(64, 0.8, 3000);
    expect(s.getState().score).toMatchObject({ hits: 3, extras: 1, streak: 1, bestStreak: 2 });
  });

  it('counts unplayed notes as misses by the end and reports accuracy', () => {
    const s = tempoSession([pn(60, 0, 0.5), pn(62, 0.5, 0.5), pn(64, 1, 0.5), pn(65, 1.5, 0.5)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2000);
    s.tick(10_000);
    const state = s.getState();
    expect(state.status).toBe('finished');
    expect(state.score).toMatchObject({ hits: 1, misses: 3 });
    expect(scorePercent(state.score!)).toBe(25);
  });

  it('at half speed a press 200 ms late is outside the scaled window', () => {
    const s = tempoSession([pn(60, 0, 1)], 0.5);
    s.tick(2200);
    s.noteOn(60, 0.8, 2200);
    expect(s.getState().pressed.get(60)).toBe('wrong');
    expect(s.getState().score).toMatchObject({ hits: 0, extras: 1 });
  });
});
