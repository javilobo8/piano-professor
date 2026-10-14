import { describe, expect, it, vi } from 'vitest';
import { SoundOutput, type BrowserPiano, type PianoLink } from '../../src/audio/sound-output';
import type { VoiceSource } from '../../src/audio/voices';
import type { OutputEvent } from '../../src/engine/types';
import type { ConnectionStatus, NoteEvent, PedalEvent } from '../../src/midi-io/types';

class FakeLink implements PianoLink {
  sent: OutputEvent[] = [];
  private notes = new Set<(e: NoteEvent) => void>();
  private pedals = new Set<(e: PedalEvent) => void>();
  private statuses = new Set<(s: ConnectionStatus) => void>();
  send(event: OutputEvent) {
    this.sent.push(event);
  }
  onNote(cb: (e: NoteEvent) => void) {
    this.notes.add(cb);
    return () => this.notes.delete(cb);
  }
  onPedal(cb: (e: PedalEvent) => void) {
    this.pedals.add(cb);
    return () => this.pedals.delete(cb);
  }
  subscribe(cb: (s: ConnectionStatus) => void) {
    this.statuses.add(cb);
    return () => this.statuses.delete(cb);
  }
  play(type: 'on' | 'off', pitch: number, velocity = 0.5) {
    for (const cb of this.notes) cb({ type, pitch, velocity, timeMs: 0 });
  }
  pedal(down: boolean) {
    for (const cb of this.pedals) cb({ type: 'pedal', down, timeMs: 0 });
  }
  status(s: ConnectionStatus) {
    for (const cb of this.statuses) cb(s);
  }
}

class FakeWebPiano implements BrowserPiano {
  calls: string[] = [];
  load: () => Promise<void> = vi.fn(async () => undefined);
  noteOn(source: VoiceSource, pitch: number, velocity: number) {
    this.calls.push(`on ${source} ${pitch} ${velocity}`);
  }
  noteOff(source: VoiceSource, pitch: number) {
    this.calls.push(`off ${source} ${pitch}`);
  }
  setPedal(down: boolean) {
    this.calls.push(`pedal ${down}`);
  }
  allNotesOff(source?: VoiceSource) {
    this.calls.push(`alloff ${source ?? 'all'}`);
  }
}

function setup() {
  const link = new FakeLink();
  const web = new FakeWebPiano();
  const output = new SoundOutput(link, web);
  return { link, web, output };
}

describe('SoundOutput', () => {
  it('sends everything to the piano by default', () => {
    const { link, web, output } = setup();
    expect(output.target).toBe('piano');
    output.send({ type: 'noteOn', pitch: 60, velocity: 100 });
    expect(link.sent).toEqual([{ type: 'noteOn', pitch: 60, velocity: 100 }]);
    expect(web.calls).toEqual([]);
    expect(web.load).not.toHaveBeenCalled();
  });

  it('plays the app notes only in the browser when the output is the browser', () => {
    const { link, web, output } = setup();
    output.setTarget('web');
    link.sent = [];
    output.send({ type: 'noteOn', pitch: 60, velocity: 127 });
    output.send({ type: 'noteOff', pitch: 60 });
    output.send({ type: 'allNotesOff' });
    expect(web.calls).toEqual(['on app 60 1', 'off app 60', 'alloff app']);
    expect(link.sent).toEqual([]);
  });

  it('sends to both', () => {
    const { link, web, output } = setup();
    output.setTarget('both');
    output.send({ type: 'noteOn', pitch: 64, velocity: 127 });
    expect(link.sent).toEqual([{ type: 'noteOn', pitch: 64, velocity: 127 }]);
    expect(web.calls).toEqual(['on app 64 1']);
  });

  it('echoes the keys and pedal played on the piano in the browser only when it is a target', () => {
    const { link, web, output } = setup();
    link.play('on', 60);
    link.pedal(true);
    expect(web.calls).toEqual([]);
    output.setTarget('both');
    link.play('on', 60, 0.5);
    link.pedal(true);
    link.play('off', 60);
    link.pedal(false);
    expect(web.calls).toEqual(['on player 60 0.5', 'pedal true', 'off player 60', 'pedal false']);
    expect(link.sent).toEqual([]);
  });

  it('loads the browser piano when it becomes a target', () => {
    const { web, output } = setup();
    output.setTarget('web');
    output.setTarget('both');
    expect(web.load).toHaveBeenCalledTimes(1);
    output.setTarget('piano');
    output.setTarget('both');
    expect(web.load).toHaveBeenCalledTimes(2);
  });

  it('silences the destination it stops using', () => {
    const { link, web, output } = setup();
    output.setTarget('both');
    output.setTarget('piano');
    expect(web.calls).toEqual(['alloff all']);
    output.setTarget('web');
    expect(link.sent).toEqual([{ type: 'allNotesOff' }]);
  });

  it('does nothing when the target does not change', () => {
    const { link, web, output } = setup();
    output.setTarget('web');
    link.sent = [];
    output.setTarget('web');
    expect(web.load).toHaveBeenCalledTimes(1);
    expect(link.sent).toEqual([]);
    expect(web.calls).toEqual([]);
  });

  it('releases the player notes when the piano disconnects', () => {
    const { link, web, output } = setup();
    output.setTarget('web');
    link.status({ state: 'disconnected', error: null });
    expect(web.calls).toEqual(['alloff player']);
  });

  it('keeps sending to the piano whatever the browser piano does', () => {
    const link = new FakeLink();
    const web = new FakeWebPiano();
    web.load = () => Promise.reject(new Error('offline'));
    const output = new SoundOutput(link, web);
    output.setTarget('both');
    output.send({ type: 'noteOn', pitch: 60, velocity: 90 });
    expect(link.sent).toContainEqual({ type: 'noteOn', pitch: 60, velocity: 90 });
  });
});
