import { describe, expect, it, vi } from 'vitest';
import {
  BluetoothUnavailableError,
  ConnectionManager,
  MidiAccessError,
} from '../../src/midi-io/connection-manager';
import type { ConnectionStatus, MidiConnection, NoteEvent } from '../../src/midi-io/types';

class FakePort {
  state: 'connected' | 'disconnected' = 'connected';
  onmidimessage: ((e: { data: Uint8Array; timeStamp: number }) => void) | null = null;
  sent: number[][] = [];
  private listeners = new Set<() => void>();
  constructor(
    readonly id: string,
    readonly name: string,
  ) {}
  addEventListener(_type: string, cb: () => void) {
    this.listeners.add(cb);
  }
  removeEventListener(_type: string, cb: () => void) {
    this.listeners.delete(cb);
  }
  send(data: number[]) {
    this.sent.push(data);
  }
  unplug() {
    this.state = 'disconnected';
    for (const cb of this.listeners) cb();
  }
  play(data: number[], timeStamp = performance.now()) {
    this.onmidimessage?.({ data: Uint8Array.from(data), timeStamp });
  }
}

class FakeAccess {
  inputs = new Map<string, FakePort>();
  outputs = new Map<string, FakePort>();
  onstatechange: (() => void) | null = null;
  plug(input: FakePort, output?: FakePort) {
    this.inputs.set(input.id, input);
    if (output) this.outputs.set(output.id, output);
    this.onstatechange?.();
  }
}

function setup() {
  const access = new FakeAccess();
  const manager = new ConnectionManager({
    requestMIDIAccess: async () => access as unknown as MIDIAccess,
  });
  const statuses: ConnectionStatus[] = [];
  manager.subscribe((s) => statuses.push(s));
  const notes: NoteEvent[] = [];
  manager.onNote((e) => notes.push(e));
  return { access, manager, statuses, notes };
}

describe('ConnectionManager over USB', () => {
  it('connects to the FP-10 and forwards its notes', async () => {
    const { access, manager, notes } = setup();
    access.inputs.set('a', new FakePort('a', 'Midi Through'));
    const fp10 = new FakePort('b', 'FP-10');
    access.inputs.set('b', fp10);
    await manager.startUsb(null);
    expect(manager.current).toEqual({ state: 'connected', kind: 'usb', name: 'FP-10' });
    fp10.play([0x90, 60, 127]);
    expect(notes).toMatchObject([{ type: 'on', pitch: 60, velocity: 1 }]);
  });

  it('sends output to the port with the same name', async () => {
    const { access, manager } = setup();
    const output = new FakePort('out', 'FP-10');
    access.inputs.set('in', new FakePort('in', 'FP-10'));
    access.outputs.set('out', output);
    await manager.startUsb(null);
    manager.send({ type: 'noteOn', pitch: 60, velocity: 90 });
    expect(output.sent).toEqual([[0x90, 60, 90]]);
  });

  it('notices unplug and replug', async () => {
    const { access, manager } = setup();
    const fp10 = new FakePort('b', 'FP-10');
    access.inputs.set('b', fp10);
    await manager.startUsb(null);
    fp10.unplug();
    expect(manager.current).toEqual({ state: 'disconnected', error: null });
    access.plug(new FakePort('c', 'FP-10'));
    expect(manager.current).toMatchObject({ state: 'connected', name: 'FP-10' });
  });

  it('waits for a device when none is plugged in', async () => {
    const { access, manager } = setup();
    await manager.startUsb(null);
    expect(manager.current).toEqual({ state: 'disconnected', error: null });
    access.plug(new FakePort('x', 'FP-10'));
    expect(manager.current.state).toBe('connected');
  });

  it('reports unsupported or denied MIDI', async () => {
    const unsupported = new ConnectionManager({
      requestMIDIAccess: () => Promise.reject(new MidiAccessError('midi-unsupported')),
    });
    await unsupported.startUsb(null);
    expect(unsupported.current).toEqual({ state: 'disconnected', error: 'midi-unsupported' });
    const denied = new ConnectionManager({ requestMIDIAccess: () => Promise.reject(new Error('nope')) });
    await denied.startUsb(null);
    expect(denied.current).toEqual({ state: 'disconnected', error: 'midi-denied' });
  });

  it('lets the user pick another input', async () => {
    const { access, manager } = setup();
    access.inputs.set('a', new FakePort('a', 'FP-10'));
    access.inputs.set('b', new FakePort('b', 'Other'));
    await manager.startUsb(null);
    expect(manager.listUsbInputs()).toEqual([
      { id: 'a', name: 'FP-10' },
      { id: 'b', name: 'Other' },
    ]);
    manager.selectUsbInput('b');
    expect(manager.current).toMatchObject({ state: 'connected', name: 'Other' });
  });
});

describe('ConnectionManager over Bluetooth', () => {
  function fakeBle(): MidiConnection & { emit(e: NoteEvent): void; drop(): void; sent: unknown[] } {
    const noteCbs = new Set<(e: NoteEvent) => void>();
    const dropCbs = new Set<() => void>();
    return {
      kind: 'ble',
      name: 'FP-10 BLE',
      sent: [],
      onNote(cb) {
        noteCbs.add(cb);
        return () => noteCbs.delete(cb);
      },
      onDisconnect(cb) {
        dropCbs.add(cb);
        return () => dropCbs.delete(cb);
      },
      send(e) {
        this.sent.push(e);
      },
      close: vi.fn(),
      emit(e) {
        for (const cb of noteCbs) cb(e);
      },
      drop() {
        for (const cb of dropCbs) cb();
      },
    };
  }

  it('connects on request and forwards notes', async () => {
    const ble = fakeBle();
    const manager = new ConnectionManager({ requestBle: async () => ble });
    const notes: NoteEvent[] = [];
    manager.onNote((e) => notes.push(e));
    await manager.connectBluetooth();
    expect(manager.current).toEqual({ state: 'connected', kind: 'ble', name: 'FP-10 BLE' });
    ble.emit({ type: 'on', pitch: 62, velocity: 0.5, timeMs: 1 });
    expect(notes).toHaveLength(1);
    ble.drop();
    expect(manager.current).toEqual({ state: 'disconnected', error: null });
  });

  it('shows no error when the user cancels the chooser', async () => {
    const manager = new ConnectionManager({
      requestBle: () => Promise.reject(new DOMException('cancelled', 'NotFoundError')),
    });
    await manager.connectBluetooth();
    expect(manager.current).toEqual({ state: 'disconnected', error: null });
  });

  it('reports unavailable Bluetooth and failed connections', async () => {
    const off = new ConnectionManager({ requestBle: () => Promise.reject(new BluetoothUnavailableError()) });
    await off.connectBluetooth();
    expect(off.current).toEqual({ state: 'disconnected', error: 'bluetooth-unsupported' });
    const failing = new ConnectionManager({ requestBle: () => Promise.reject(new Error('GATT')) });
    await failing.connectBluetooth();
    expect(failing.current).toEqual({ state: 'disconnected', error: 'bluetooth-failed' });
  });
});

describe('ConnectionManager virtual keyboard', () => {
  it('forwards on-screen notes to listeners', () => {
    const manager = new ConnectionManager({ requestMIDIAccess: () => Promise.reject(new Error()) });
    const notes: NoteEvent[] = [];
    manager.onNote((e) => notes.push(e));
    manager.emitVirtual({ type: 'on', pitch: 60, velocity: 0.8, timeMs: 5 });
    expect(notes).toEqual([{ type: 'on', pitch: 60, velocity: 0.8, timeMs: 5 }]);
  });
});
