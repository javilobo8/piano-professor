import { describe, expect, it } from 'vitest';
import type { SessionState, Status } from '../../src/engine/types';
import { restartPosition } from '../../src/ui/restart-position';

function state(songTime: number, status: Status): SessionState {
  return {
    songTime,
    status,
    speed: 1,
    loop: null,
    pressed: new Map(),
    expected: new Set(),
    score: null,
    loopPass: 0,
    lastLoopScore: null,
    complete: false,
  };
}

describe('restartPosition', () => {
  it('starts fresh once the run has finished', () => {
    expect(restartPosition(state(31, 'finished'), 0.5)).toBeNull();
  });

  it('starts fresh during the lead-in, before the first note', () => {
    expect(restartPosition(state(-1.2, 'playing'), 0.5)).toBeNull();
    expect(restartPosition(state(0.5, 'playing'), 0.5)).toBeNull();
  });

  it('keeps the position mid-song, whether playing, waiting or paused', () => {
    expect(restartPosition(state(12.5, 'playing'), 0.5)).toBe(12.5);
    expect(restartPosition(state(12.5, 'waiting'), 0.5)).toBe(12.5);
    expect(restartPosition(state(12.5, 'paused'), 0.5)).toBe(12.5);
  });
});
