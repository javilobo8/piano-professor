import { describe, expect, it } from 'vitest';
import { buildDemoMidi } from '../../src/song/demo';
import { autoHandConfig } from '../../src/song/hands';
import { parseSong } from '../../src/song/parse';
import { buildSteps } from '../../src/song/steps';
import { pn } from '../helpers/make-midi';

describe('buildSteps', () => {
  it('groups notes starting within 30 ms into one step', () => {
    const steps = buildSteps([pn(60, 0, 1), pn(64, 0.02, 1), pn(67, 0.5, 1), pn(72, 0.55, 1)]);
    expect(steps.map((s) => [s.time, s.notes.map((n) => n.pitch)])).toEqual([
      [0, [60, 64]],
      [0.5, [67]],
      [0.55, [72]],
    ]);
  });

  it('returns no steps for no notes', () => {
    expect(buildSteps([])).toEqual([]);
  });
});

describe('demo song', () => {
  it('parses into two named hands, 8 bars of 4/4 at 100 bpm', () => {
    const song = parseSong(buildDemoMidi(), 'Ode to Joy (Beethoven).mid');
    expect(song.title).toBe('Ode to Joy (Beethoven)');
    expect(song.tracks.map((t) => t.name)).toEqual(['Right hand', 'Left hand']);
    expect(autoHandConfig(song).trackRoles).toEqual({ 0: 'right', 1: 'left' });
    expect(song.measures).toHaveLength(9);
    expect(song.measures[1]).toBeCloseTo(2.4);
    expect(song.notes.filter((n) => n.track === 0)).toHaveLength(30);
  });
});
