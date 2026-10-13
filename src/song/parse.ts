import { Midi, type Header } from '@tonejs/midi';
import type { Song, SongNote, TrackInfo } from './types';

export const PIANO_LOW = 21;
export const PIANO_HIGH = 108;
const PERCUSSION_CHANNEL = 9;
const MAX_MEASURES = 10_000;

export class SongParseError extends Error {
  constructor(readonly code: 'invalid' | 'empty') {
    super(code === 'invalid' ? 'Not a valid MIDI file' : 'MIDI file has no playable notes');
    this.name = 'SongParseError';
  }
}

export function titleFromFileName(fileName: string): string {
  const title = fileName.replace(/\.(mid|midi)$/i, '').trim();
  return title || 'Untitled';
}

export function parseSong(bytes: ArrayBuffer | Uint8Array, fileName: string): Song {
  let midi: Midi;
  try {
    midi = new Midi(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch {
    throw new SongParseError('invalid');
  }

  const tracks: TrackInfo[] = [];
  const raw: Omit<SongNote, 'id'>[] = [];
  for (const track of midi.tracks) {
    if (track.channel === PERCUSSION_CHANNEL) continue;
    const playable = track.notes.filter((n) => n.midi >= PIANO_LOW && n.midi <= PIANO_HIGH);
    if (playable.length === 0) continue;
    const index = tracks.length;
    let pitchSum = 0;
    for (const n of playable) {
      pitchSum += n.midi;
      raw.push({
        pitch: n.midi,
        start: n.time,
        end: n.time + Math.max(0, n.duration),
        velocity: n.velocity,
        track: index,
      });
    }
    tracks.push({
      index,
      name: track.name.trim(),
      channel: track.channel,
      noteCount: playable.length,
      avgPitch: pitchSum / playable.length,
    });
  }
  if (raw.length === 0) throw new SongParseError('empty');

  raw.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const notes: SongNote[] = raw.map((n, id) => ({ ...n, id }));
  const duration = notes.reduce((max, n) => Math.max(max, n.end), 0);
  return {
    title: titleFromFileName(fileName),
    duration,
    notes,
    tracks,
    measures: computeMeasures(midi.header, duration),
  };
}

function computeMeasures(header: Header, duration: number): number[] {
  const sigs = [...header.timeSignatures]
    .filter((s) => s.timeSignature[0] > 0 && s.timeSignature[1] > 0)
    .sort((a, b) => a.ticks - b.ticks);
  if (sigs.length === 0 || sigs[0].ticks > 0) sigs.unshift({ ticks: 0, timeSignature: [4, 4] });

  const endTicks = header.secondsToTicks(duration);
  const measures: number[] = [];
  let tick = 0;
  let sig = 0;
  for (;;) {
    while (sig + 1 < sigs.length && sigs[sig + 1].ticks <= tick) sig++;
    measures.push(header.ticksToSeconds(tick));
    if ((tick >= endTicks && measures.length >= 2) || measures.length > MAX_MEASURES) break;
    const [num, den] = sigs[sig].timeSignature;
    let next = tick + (header.ppq * 4 * num) / den;
    if (sig + 1 < sigs.length && sigs[sig + 1].ticks < next) next = sigs[sig + 1].ticks;
    tick = next;
  }
  return measures;
}
