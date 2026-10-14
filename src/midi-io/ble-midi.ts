import type { OutputEvent } from '../engine/types';
import {
  BLE_MIDI_CHARACTERISTIC,
  BLE_MIDI_SERVICE,
  MESSAGES_PER_PACKET,
  decodeBlePacket,
  encodeBlePacket,
} from './ble-packet';
import { MidiOutputEncoder, decodeMidiMessage } from './messages';
import type { MidiConnection, MidiInputEvent } from './types';

const RECONNECT_DELAYS_MS = [1000, 2000, 4000];

/** Piano connected directly from the page over Web Bluetooth (BLE-MIDI). */
export class BleMidiConnection implements MidiConnection {
  readonly kind = 'ble' as const;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private inputListeners = new Set<(e: MidiInputEvent) => void>();
  private disconnectListeners = new Set<() => void>();
  private encoder = new MidiOutputEncoder();
  private writes: Promise<unknown> = Promise.resolve();
  /** Messages sent in the current task, written together from one microtask. */
  private pending: number[][] = [];
  private closed = false;
  private reconnecting = false;

  private constructor(private readonly device: BluetoothDevice) {}

  /** Opens Chrome's device chooser (BLE-MIDI devices only) and connects. Needs a user gesture. */
  static async request(bluetooth: Bluetooth): Promise<BleMidiConnection> {
    const device = await bluetooth.requestDevice({ filters: [{ services: [BLE_MIDI_SERVICE] }] });
    const connection = new BleMidiConnection(device);
    try {
      await connection.connect();
    } catch (e) {
      device.gatt?.disconnect();
      throw e;
    }
    device.addEventListener('gattserverdisconnected', connection.handleDisconnect);
    return connection;
  }

  get name(): string {
    return this.device.name || 'Bluetooth MIDI';
  }

  onInput(cb: (e: MidiInputEvent) => void): () => void {
    this.inputListeners.add(cb);
    return () => {
      this.inputListeners.delete(cb);
    };
  }

  onDisconnect(cb: () => void): () => void {
    this.disconnectListeners.add(cb);
    return () => {
      this.disconnectListeners.delete(cb);
    };
  }

  send(event: OutputEvent): void {
    if (!this.characteristic) return;
    const messages = this.encoder.encode(event);
    if (messages.length === 0) return;
    // Coalesce everything sent in this task (e.g. a chord) into as few packets as possible.
    if (this.pending.length === 0) queueMicrotask(this.flushPending);
    this.pending.push(...messages);
  }

  close(): void {
    this.closed = true;
    this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.handleValue);
    this.characteristic = null;
    this.device.gatt?.disconnect();
    this.inputListeners.clear();
    this.disconnectListeners.clear();
  }

  private async connect(): Promise<void> {
    const server = await this.device.gatt!.connect();
    const service = await server.getPrimaryService(BLE_MIDI_SERVICE);
    const characteristic = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);
    characteristic.addEventListener('characteristicvaluechanged', this.handleValue);
    await characteristic.startNotifications();
    this.characteristic = characteristic;
  }

  private flushPending = (): void => {
    const messages = this.pending;
    this.pending = [];
    const characteristic = this.characteristic;
    if (!characteristic) return;
    const now = performance.now();
    for (let i = 0; i < messages.length; i += MESSAGES_PER_PACKET) {
      const packet = encodeBlePacket(messages.slice(i, i + MESSAGES_PER_PACKET), now);
      // GATT allows one operation at a time: queue the writes.
      this.writes = this.writes
        .then(() => characteristic.writeValueWithoutResponse(packet))
        .catch(() => undefined);
    }
  };

  private handleValue = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const now = performance.now();
    const packet = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    for (const message of decodeBlePacket(packet)) {
      const input = decodeMidiMessage(message, now);
      if (input) for (const cb of this.inputListeners) cb(input);
    }
  };

  private handleDisconnect = async (): Promise<void> => {
    if (this.closed || this.reconnecting) return;
    this.reconnecting = true;
    try {
      this.characteristic?.removeEventListener('characteristicvaluechanged', this.handleValue);
      this.characteristic = null;
      for (const delay of RECONNECT_DELAYS_MS) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (this.closed) return;
        try {
          await this.connect();
          return;
        } catch {
          // Try again after the next delay.
        }
      }
    } finally {
      this.reconnecting = false;
    }
    for (const cb of [...this.disconnectListeners]) cb();
  };
}
