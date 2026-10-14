import { describe, expect, it } from 'vitest';
import { MidiOutputEncoder, decodeMidiMessage, pickPreferredPort } from '../../src/midi-io/messages';

describe('decodeMidiMessage', () => {
  it('decodes note on on any channel', () => {
    expect(decodeMidiMessage([0x93, 60, 127], 5)).toEqual({ type: 'on', pitch: 60, velocity: 1, timeMs: 5 });
  });

  it('treats note off and note on with velocity 0 as off', () => {
    expect(decodeMidiMessage([0x80, 60, 64], 1)).toEqual({ type: 'off', pitch: 60, velocity: 0, timeMs: 1 });
    expect(decodeMidiMessage([0x90, 60, 0], 1)).toEqual({ type: 'off', pitch: 60, velocity: 0, timeMs: 1 });
  });

  it('decodes the sustain pedal on any channel', () => {
    expect(decodeMidiMessage([0xb0, 64, 127], 3)).toEqual({ type: 'pedal', down: true, timeMs: 3 });
    expect(decodeMidiMessage([0xb2, 64, 64], 3)).toEqual({ type: 'pedal', down: true, timeMs: 3 });
    expect(decodeMidiMessage([0xb0, 64, 63], 4)).toEqual({ type: 'pedal', down: false, timeMs: 4 });
  });

  it('ignores other controllers, other messages and short data', () => {
    expect(decodeMidiMessage([0xb0, 7, 100], 0)).toBeNull();
    expect(decodeMidiMessage([0xfe], 0)).toBeNull();
  });
});

describe('MidiOutputEncoder', () => {
  it('encodes notes on channel 1', () => {
    const enc = new MidiOutputEncoder();
    expect(enc.encode({ type: 'noteOn', pitch: 60, velocity: 100 })).toEqual([[0x90, 60, 100]]);
    expect(enc.encode({ type: 'noteOff', pitch: 60 })).toEqual([[0x80, 60, 0]]);
  });

  it('allNotesOff releases the notes it switched on, then sends CC 123', () => {
    const enc = new MidiOutputEncoder();
    enc.encode({ type: 'noteOn', pitch: 60, velocity: 100 });
    enc.encode({ type: 'noteOn', pitch: 64, velocity: 100 });
    enc.encode({ type: 'noteOff', pitch: 60 });
    expect(enc.encode({ type: 'allNotesOff' })).toEqual([
      [0x80, 64, 0],
      [0xb0, 123, 0],
    ]);
    expect(enc.encode({ type: 'allNotesOff' })).toEqual([[0xb0, 123, 0]]);
  });
});

describe('pickPreferredPort', () => {
  const ports = [{ name: 'Midi Through' }, { name: 'FP-10 MIDI 1' }, { name: 'Other' }];

  it('prefers the remembered port', () => {
    expect(pickPreferredPort(ports, 'Other')).toEqual({ name: 'Other' });
  });

  it('then a Roland FP-10', () => {
    expect(pickPreferredPort(ports, 'Gone')).toEqual({ name: 'FP-10 MIDI 1' });
    expect(pickPreferredPort([{ name: 'a' }, { name: 'ROLAND Digital Piano' }], null)).toEqual({
      name: 'ROLAND Digital Piano',
    });
  });

  it('then the first port, or null', () => {
    expect(pickPreferredPort([{ name: 'a' }, { name: 'b' }], null)).toEqual({ name: 'a' });
    expect(pickPreferredPort([], null)).toBeNull();
  });

  it('skips the Midi Through loopback unless it was chosen by hand', () => {
    expect(pickPreferredPort([{ name: 'Midi Through Port-0' }], null)).toBeNull();
    expect(pickPreferredPort([{ name: 'Midi Through Port-0' }, { name: 'a' }], null)).toEqual({ name: 'a' });
    expect(pickPreferredPort([{ name: 'Midi Through Port-0' }], 'Midi Through Port-0')).toEqual({
      name: 'Midi Through Port-0',
    });
  });
});
