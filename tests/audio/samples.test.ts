import { describe, expect, it } from 'vitest';
import { SAMPLE_PITCHES, nearestSample, sampleName, velocityCutoff, velocityGain } from '../../src/audio/samples';

describe('piano samples', () => {
  it('has 30 recorded pitches from A0 to C8, a minor third apart', () => {
    expect(SAMPLE_PITCHES).toHaveLength(30);
    expect(SAMPLE_PITCHES[0]).toBe(21);
    expect(SAMPLE_PITCHES.at(-1)).toBe(108);
    expect(SAMPLE_PITCHES[1] - SAMPLE_PITCHES[0]).toBe(3);
  });

  it('names samples like the Tone.js files', () => {
    expect([21, 24, 27, 30, 60, 108].map(sampleName)).toEqual(['A0', 'C1', 'Ds1', 'Fs1', 'C4', 'C8']);
  });

  it('plays each pitch from the nearest sample, at most a semitone away', () => {
    expect(nearestSample(60)).toEqual({ samplePitch: 60, playbackRate: 1 });
    expect(nearestSample(61).samplePitch).toBe(60);
    expect(nearestSample(61).playbackRate).toBeCloseTo(2 ** (1 / 12));
    expect(nearestSample(62).samplePitch).toBe(63);
    expect(nearestSample(62).playbackRate).toBeCloseTo(2 ** (-1 / 12));
    for (let pitch = 21; pitch <= 108; pitch++) {
      expect(Math.abs(pitch - nearestSample(pitch).samplePitch)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps pitches outside the piano on the edge samples', () => {
    expect(nearestSample(10).samplePitch).toBe(21);
    expect(nearestSample(120).samplePitch).toBe(108);
  });

  it('makes soft notes quieter and darker', () => {
    expect(velocityGain(1)).toBeCloseTo(1);
    expect(velocityGain(0)).toBeCloseTo(0.05);
    expect(velocityGain(0.5)).toBeLessThan(velocityGain(0.8));
    expect(velocityCutoff(0)).toBeCloseTo(1500);
    expect(velocityCutoff(1)).toBeCloseTo(16000);
    expect(velocityCutoff(0.5)).toBeLessThan(velocityCutoff(0.8));
  });
});
