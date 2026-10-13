import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BleMidiConnection } from '../../src/midi-io/ble-midi';
import { decodeBlePacket, encodeBlePacket } from '../../src/midi-io/ble-packet';
import type { NoteEvent } from '../../src/midi-io/types';

class FakeCharacteristic extends EventTarget {
  value: DataView | null = null;
  startNotifications = vi.fn(async () => this);
  writes: Uint8Array[] = [];
  inFlight = 0;
  maxInFlight = 0;
  writeValueWithoutResponse = vi.fn(async (data: BufferSource) => {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    this.writes.push(new Uint8Array(data as ArrayBuffer).slice());
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.inFlight--;
  });
  notify(packet: Uint8Array) {
    this.value = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class FakeDevice extends EventTarget {
  name = 'FP-10 BLE';
  characteristic = new FakeCharacteristic();
  connectAttempts = 0;
  /** Connect attempts (1-based) that fail. */
  failing = new Set<number>();
  failFrom = Infinity;
  disconnect = vi.fn();
  gatt = {
    connect: vi.fn(async () => {
      this.connectAttempts++;
      if (this.failing.has(this.connectAttempts) || this.connectAttempts >= this.failFrom) {
        throw new Error('GATT');
      }
      return {
        getPrimaryService: async () => ({ getCharacteristic: async () => this.characteristic }),
      };
    }),
    disconnect: this.disconnect,
  };
  drop() {
    this.dispatchEvent(new Event('gattserverdisconnected'));
  }
}

function bluetoothFor(device: FakeDevice) {
  return { requestDevice: vi.fn(async () => device) } as unknown as Bluetooth;
}

async function open(device = new FakeDevice()) {
  const connection = await BleMidiConnection.request(bluetoothFor(device));
  return { device, connection };
}

describe('BleMidiConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects, starts notifications and delivers incoming notes', async () => {
    const { device, connection } = await open();
    expect(connection.name).toBe('FP-10 BLE');
    expect(device.characteristic.startNotifications).toHaveBeenCalledTimes(1);
    const notes: NoteEvent[] = [];
    connection.onNote((e) => notes.push(e));
    device.characteristic.notify(
      encodeBlePacket(
        [
          [0x90, 60, 127],
          [0x80, 60, 0],
        ],
        1000,
      ),
    );
    expect(notes).toMatchObject([
      { type: 'on', pitch: 60, velocity: 1 },
      { type: 'off', pitch: 60 },
    ]);
  });

  it('writes output as BLE-MIDI packets, one write at a time', async () => {
    const { device, connection } = await open();
    for (const pitch of [60, 61, 62, 63, 64]) connection.send({ type: 'noteOn', pitch, velocity: 90 });
    connection.send({ type: 'allNotesOff' });
    await vi.advanceTimersByTimeAsync(100);
    const messages = device.characteristic.writes.map((w) => decodeBlePacket(w));
    // 5 note-ons (1 packet each), then 5 note-offs + all-notes-off CC = 6 messages split 4 + 2.
    expect(messages.map((m) => m.length)).toEqual([1, 1, 1, 1, 1, 4, 2]);
    expect(messages[0]).toEqual([[0x90, 60, 90]]);
    expect(messages.slice(5).flat().map(([status]) => status & 0xf0)).toEqual([0x80, 0x80, 0x80, 0x80, 0x80, 0xb0]);
    expect(device.characteristic.maxInFlight).toBe(1);
  });

  it('reconnects after 1 s when the link drops', async () => {
    const { device, connection } = await open();
    const dropped = vi.fn();
    connection.onDisconnect(dropped);
    device.drop();
    await vi.advanceTimersByTimeAsync(999);
    expect(device.connectAttempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(device.connectAttempts).toBe(2);
    expect(dropped).not.toHaveBeenCalled();
    // Notes flow again after the reconnect.
    const notes: NoteEvent[] = [];
    connection.onNote((e) => notes.push(e));
    device.characteristic.notify(encodeBlePacket([[0x90, 60, 100]], 1));
    expect(notes).toHaveLength(1);
  });

  it('retries after 2 s and 4 s, then reports the disconnect once', async () => {
    const { device, connection } = await open();
    device.failFrom = 2;
    const dropped = vi.fn();
    connection.onDisconnect(dropped);
    device.drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(device.connectAttempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(device.connectAttempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(device.connectAttempts).toBe(3);
    await vi.advanceTimersByTimeAsync(3999);
    expect(device.connectAttempts).toBe(3);
    expect(dropped).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(device.connectAttempts).toBe(4);
    expect(dropped).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20000);
    expect(device.connectAttempts).toBe(4);
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('does not start a second reconnect loop on a repeated disconnect event', async () => {
    const { device } = await open();
    device.failFrom = 2;
    device.drop();
    await vi.advanceTimersByTimeAsync(500);
    device.drop();
    await vi.advanceTimersByTimeAsync(20000);
    // One loop: the initial connect plus exactly three retries.
    expect(device.connectAttempts).toBe(4);
  });

  it('close() during the reconnect wait stops further attempts', async () => {
    const { device, connection } = await open();
    device.drop();
    await vi.advanceTimersByTimeAsync(500);
    connection.close();
    expect(device.disconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20000);
    expect(device.connectAttempts).toBe(1);
  });

  it('releases the GATT connection when setup fails after connecting', async () => {
    const device = new FakeDevice();
    device.characteristic.startNotifications.mockRejectedValueOnce(new Error('notify'));
    await expect(BleMidiConnection.request(bluetoothFor(device))).rejects.toThrow('notify');
    expect(device.disconnect).toHaveBeenCalledTimes(1);
  });
});
