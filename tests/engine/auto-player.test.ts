import { describe, expect, it } from 'vitest';
import { AutoPlayer } from '../../src/engine/auto-player';
import type { OutputEvent } from '../../src/engine/types';
import { pn } from '../helpers/make-midi';

function run(player: AutoPlayer, t: number, volume = 1): OutputEvent[] {
  const events: OutputEvent[] = [];
  player.advanceTo(t, volume, (e) => events.push(e));
  return events;
}

describe('AutoPlayer', () => {
  it('emits note starts and ends in time order', () => {
    const player = new AutoPlayer([pn(60, 0, 1), pn(64, 1, 1)]);
    player.reset(-1);
    expect(run(player, -0.5)).toEqual([]);
    expect(run(player, 0)).toEqual([{ type: 'noteOn', pitch: 60, velocity: 102 }]);
    expect(run(player, 1)).toEqual([
      { type: 'noteOff', pitch: 60 },
      { type: 'noteOn', pitch: 64, velocity: 102 },
    ]);
    expect(run(player, 5)).toEqual([{ type: 'noteOff', pitch: 64 }]);
  });

  it('scales velocity by volume, never below 1', () => {
    const player = new AutoPlayer([pn(60, 0, 1), pn(62, 0, 1)]);
    player.reset(0);
    const events = run(player, 0, 0.5);
    expect(events).toEqual([
      { type: 'noteOn', pitch: 60, velocity: 51 },
      { type: 'noteOn', pitch: 62, velocity: 51 },
    ]);
    const quiet = new AutoPlayer([pn(60, 0, 1)]);
    quiet.reset(0);
    expect(run(quiet, 0, 0.001)).toEqual([{ type: 'noteOn', pitch: 60, velocity: 1 }]);
  });

  it('retriggers an overlapping note of the same pitch and only releases it at the last end', () => {
    const player = new AutoPlayer([pn(60, 0, 2), pn(60, 1, 2)]);
    player.reset(0);
    expect(run(player, 1)).toEqual([
      { type: 'noteOn', pitch: 60, velocity: 102 },
      { type: 'noteOff', pitch: 60 },
      { type: 'noteOn', pitch: 60, velocity: 102 },
    ]);
    expect(run(player, 2.5)).toEqual([]);
    expect(run(player, 3)).toEqual([{ type: 'noteOff', pitch: 60 }]);
  });

  it('reset skips notes that start before the new position', () => {
    const player = new AutoPlayer([pn(60, 0, 1), pn(64, 2, 1)]);
    player.reset(1);
    expect(run(player, 2)).toEqual([{ type: 'noteOn', pitch: 64, velocity: 102 }]);
  });
});
