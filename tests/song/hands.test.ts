import { describe, expect, it } from 'vitest';
import { applyHandConfig, autoHandConfig } from '../../src/song/hands';
import { parseSong } from '../../src/song/parse';
import { makeMidi } from '../helpers/make-midi';

describe('autoHandConfig', () => {
  it('uses track names when both hands are named', () => {
    const song = parseSong(
      makeMidi([
        { name: 'Piano LH', notes: [[72, 0, 1]] },
        { name: 'Piano RH', channel: 1, notes: [[40, 0, 1]] },
      ]),
      'a.mid',
    );
    expect(autoHandConfig(song)).toEqual({
      method: 'tracks',
      trackRoles: { 0: 'left', 1: 'right' },
      splitPitch: 60,
    });
  });

  it('recognises Spanish names', () => {
    const song = parseSong(
      makeMidi([
        { name: 'Mano derecha', notes: [[40, 0, 1]] },
        { name: 'Mano izquierda', channel: 1, notes: [[72, 0, 1]] },
      ]),
      'a.mid',
    );
    expect(autoHandConfig(song).trackRoles).toEqual({ 0: 'right', 1: 'left' });
  });

  it('falls back to average pitch of the two busiest tracks; others are accompaniment', () => {
    const song = parseSong(
      makeMidi([
        { name: 'Strings', notes: [[50, 0, 1]] },
        { name: 'Piano 1', channel: 1, notes: [[45, 0, 1], [47, 1, 1], [48, 2, 1]] },
        { name: 'Piano 2', channel: 2, notes: [[70, 0, 1], [72, 1, 1]] },
      ]),
      'a.mid',
    );
    expect(autoHandConfig(song).trackRoles).toEqual({ 0: 'accompaniment', 1: 'left', 2: 'right' });
  });

  it('splits by pitch when there is a single track', () => {
    const song = parseSong(makeMidi([{ notes: [[60, 0, 1], [48, 0, 1]] }]), 'a.mid');
    expect(autoHandConfig(song)).toEqual({ method: 'split', trackRoles: {}, splitPitch: 60 });
  });
});

describe('applyHandConfig', () => {
  const song = parseSong(
    makeMidi([
      { name: 'A', notes: [[72, 0, 1]] },
      { name: 'B', channel: 1, notes: [[48, 0.5, 1]] },
      { name: 'C', channel: 2, notes: [[60, 1, 1]] },
    ]),
    'a.mid',
  );

  it('assigns roles by track and drops ignored tracks', () => {
    const notes = applyHandConfig(song, {
      method: 'tracks',
      trackRoles: { 0: 'right', 1: 'ignore', 2: 'accompaniment' },
      splitPitch: 60,
    });
    expect(notes.map((n) => [n.pitch, n.role])).toEqual([
      [72, 'right'],
      [60, 'accompaniment'],
    ]);
  });

  it('treats tracks without a role as accompaniment', () => {
    const notes = applyHandConfig(song, { method: 'tracks', trackRoles: { 0: 'right' }, splitPitch: 60 });
    expect(notes.map((n) => n.role)).toEqual(['right', 'accompaniment', 'accompaniment']);
  });

  it('splits by pitch: >= splitPitch is right hand', () => {
    const notes = applyHandConfig(song, { method: 'split', trackRoles: {}, splitPitch: 60 });
    expect(notes.map((n) => [n.pitch, n.role])).toEqual([
      [72, 'right'],
      [48, 'left'],
      [60, 'right'],
    ]);
  });
});
