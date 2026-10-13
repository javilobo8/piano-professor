import type { OutputEvent } from '../engine/types';
import type { NoteEvent } from './types';

/** Note on/off from raw MIDI bytes; anything else (pedal, CC, clock…) is null. */
export function decodeMidiMessage(data: ArrayLike<number>, timeMs: number): NoteEvent | null {
  if (data.length < 3) return null;
  const type = data[0] & 0xf0;
  if (type === 0x90 && data[2] > 0) {
    return { type: 'on', pitch: data[1], velocity: data[2] / 127, timeMs };
  }
  if (type === 0x80 || type === 0x90) {
    return { type: 'off', pitch: data[1], velocity: 0, timeMs };
  }
  return null;
}

/**
 * Turns engine output into raw MIDI messages on channel 1, remembering which
 * notes it switched on so allNotesOff can release each one explicitly.
 */
export class MidiOutputEncoder {
  private on = new Set<number>();

  encode(event: OutputEvent): number[][] {
    switch (event.type) {
      case 'noteOn':
        this.on.add(event.pitch);
        return [[0x90, event.pitch, event.velocity]];
      case 'noteOff':
        this.on.delete(event.pitch);
        return [[0x80, event.pitch, 0]];
      case 'allNotesOff': {
        const messages = [...this.on].map((pitch) => [0x80, pitch, 0]);
        this.on.clear();
        messages.push([0xb0, 123, 0]);
        return messages;
      }
    }
  }
}

/** Picks the port to use: the remembered one, else a Roland FP-10, else the first. */
export function pickPreferredPort<T extends { name: string }>(ports: readonly T[], preferredName: string | null): T | null {
  return (
    (preferredName ? ports.find((p) => p.name === preferredName) : undefined) ??
    ports.find((p) => /fp-?10|roland/i.test(p.name)) ??
    ports[0] ??
    null
  );
}
