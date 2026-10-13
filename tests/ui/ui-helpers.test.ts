import { describe, expect, it } from 'vitest';
import { formatDuration, measureAt } from '../../src/ui/format';
import { pcKeyToPitch, shiftOctave } from '../../src/ui/pc-keyboard';

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(75.4)).toBe('1:15');
    expect(formatDuration(-3)).toBe('0:00');
  });
});

describe('measureAt', () => {
  const measures = [0, 2, 4, 6];
  it('finds the measure containing a time', () => {
    expect(measureAt(measures, -1)).toBe(0);
    expect(measureAt(measures, 0)).toBe(0);
    expect(measureAt(measures, 3.9)).toBe(1);
    expect(measureAt(measures, 4)).toBe(2);
    expect(measureAt(measures, 99)).toBe(2);
  });
});

describe('PC keyboard', () => {
  it('maps the home row to white keys and the row above to black keys', () => {
    expect(pcKeyToPitch('KeyA', 60)).toBe(60);
    expect(pcKeyToPitch('KeyW', 60)).toBe(61);
    expect(pcKeyToPitch('KeyJ', 60)).toBe(71);
    expect(pcKeyToPitch('Semicolon', 60)).toBe(76);
    expect(pcKeyToPitch('KeyQ', 60)).toBeNull();
  });

  it('stays inside the piano', () => {
    expect(pcKeyToPitch('KeyA', 12)).toBeNull();
    expect(shiftOctave(60, 1)).toBe(72);
    expect(shiftOctave(96, 1)).toBe(96);
    expect(shiftOctave(24, -1)).toBe(24);
  });
});
