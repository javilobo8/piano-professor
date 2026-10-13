import { Midi } from '@tonejs/midi';
import type { PlayableNote, PlayRole } from '../../src/song/types';

export interface TrackSpec {
  name?: string;
  channel?: number;
  /** [pitch, startSeconds, durationSeconds] */
  notes: Array<[number, number, number]>;
}

/** Builds a MIDI file in memory. Default tempo is 120 bpm (one beat = 0.5 s). */
export function makeMidi(
  tracks: TrackSpec[],
  opts: { bpm?: number; timeSignature?: [number, number] } = {},
): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(opts.bpm ?? 120);
  if (opts.timeSignature) {
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: opts.timeSignature });
  }
  midi.header.update();
  for (const spec of tracks) {
    const track = midi.addTrack();
    if (spec.name) track.name = spec.name;
    track.channel = spec.channel ?? 0;
    for (const [pitch, time, duration] of spec.notes) {
      track.addNote({ midi: pitch, time, duration, velocity: 0.8 });
    }
  }
  return midi.toArray();
}

let nextId = 0;

/** Shorthand for engine tests. */
export function pn(pitch: number, start: number, duration: number, role: PlayRole = 'right'): PlayableNote {
  return { id: nextId++, pitch, start, end: start + duration, velocity: 0.8, track: 0, role };
}
