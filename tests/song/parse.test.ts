import { describe, expect, it } from 'vitest';
import { SongParseError, parseSong, titleFromFileName } from '../../src/song/parse';
import { makeMidi } from '../helpers/make-midi';

describe('parseSong', () => {
  it('reads notes in seconds, sorted by start then pitch', () => {
    const bytes = makeMidi([
      { name: 'RH', notes: [[67, 1, 0.5], [64, 0, 0.5]] },
      { name: 'LH', channel: 1, notes: [[48, 0, 1]] },
    ]);
    const song = parseSong(bytes, 'song.mid');
    expect(song.notes.map((n) => [n.pitch, n.start, n.end, n.track])).toEqual([
      [48, 0, 1, 1],
      [64, 0, 0.5, 0],
      [67, 1, 1.5, 0],
    ]);
    expect(song.notes.map((n) => n.id)).toEqual([0, 1, 2]);
    expect(song.duration).toBe(1.5);
  });

  it('describes each track', () => {
    const bytes = makeMidi([
      { name: ' RH ', notes: [[60, 0, 1], [64, 1, 1]] },
      { name: 'LH', channel: 1, notes: [[48, 0, 1]] },
    ]);
    const song = parseSong(bytes, 'song.mid');
    expect(song.tracks).toEqual([
      { index: 0, name: 'RH', channel: 0, noteCount: 2, avgPitch: 62 },
      { index: 1, name: 'LH', channel: 1, noteCount: 1, avgPitch: 48 },
    ]);
  });

  it('drops percussion tracks and notes outside the piano range', () => {
    const bytes = makeMidi([
      { name: 'Drums', channel: 9, notes: [[36, 0, 0.5]] },
      { name: 'Piano', notes: [[60, 0, 0.5], [12, 0, 0.5], [120, 0, 0.5]] },
    ]);
    const song = parseSong(bytes, 'song.mid');
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0].name).toBe('Piano');
    expect(song.notes.map((n) => n.pitch)).toEqual([60]);
    expect(song.notes[0].track).toBe(0);
  });

  it('computes 4/4 measures at 120 bpm (2 s each) covering the whole song', () => {
    const song = parseSong(makeMidi([{ notes: [[60, 0, 5]] }]), 'a.mid');
    expect(song.measures).toEqual([0, 2, 4, 6]);
  });

  it('computes 3/4 measures (1.5 s each)', () => {
    const song = parseSong(makeMidi([{ notes: [[60, 0, 3]] }], { timeSignature: [3, 4] }), 'a.mid');
    expect(song.measures).toEqual([0, 1.5, 3]);
  });

  it('always returns at least two measure boundaries', () => {
    const song = parseSong(makeMidi([{ notes: [[60, 0, 0]] }]), 'a.mid');
    expect(song.measures).toEqual([0, 2]);
  });

  it('uses the file name as title', () => {
    expect(parseSong(makeMidi([{ notes: [[60, 0, 1]] }]), 'Für Elise.MIDI').title).toBe('Für Elise');
  });

  it('rejects bytes that are not MIDI', () => {
    expect(() => parseSong(new Uint8Array([1, 2, 3, 4]), 'x.mid')).toThrowError(SongParseError);
    try {
      parseSong(new Uint8Array([1, 2, 3, 4]), 'x.mid');
    } catch (e) {
      expect((e as SongParseError).code).toBe('invalid');
    }
  });

  it('rejects MIDI files without playable notes', () => {
    const bytes = makeMidi([{ channel: 9, notes: [[36, 0, 1]] }]);
    try {
      parseSong(bytes, 'x.mid');
      expect.unreachable();
    } catch (e) {
      expect((e as SongParseError).code).toBe('empty');
    }
  });
});

describe('titleFromFileName', () => {
  it('strips .mid/.midi and falls back to Untitled', () => {
    expect(titleFromFileName('a.mid')).toBe('a');
    expect(titleFromFileName('b.midi')).toBe('b');
    expect(titleFromFileName('.mid')).toBe('Untitled');
  });
});
