import type { OutputEvent } from '../engine/types';
import { BleMidiConnection } from './ble-midi';
import { pickPreferredPort } from './messages';
import type { ConnectionError, ConnectionStatus, MidiConnection, MidiInputEvent, NoteEvent, PedalEvent } from './types';
import { WebMidiConnection } from './web-midi';

export class MidiAccessError extends Error {
  constructor(readonly code: 'midi-unsupported' | 'midi-denied') {
    super(code);
    this.name = 'MidiAccessError';
  }
}

export class BluetoothUnavailableError extends Error {
  constructor() {
    super('bluetooth-unsupported');
    this.name = 'BluetoothUnavailableError';
  }
}

export interface PortInfo {
  id: string;
  name: string;
}

export interface ConnectionDeps {
  requestMIDIAccess?: () => Promise<MIDIAccess>;
  requestBle?: () => Promise<MidiConnection>;
}

async function defaultRequestMIDIAccess(): Promise<MIDIAccess> {
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
    throw new MidiAccessError('midi-unsupported');
  }
  try {
    return await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    throw new MidiAccessError('midi-denied');
  }
}

async function defaultRequestBle(): Promise<MidiConnection> {
  const bluetooth = typeof navigator === 'undefined' ? undefined : navigator.bluetooth;
  if (!bluetooth) throw new BluetoothUnavailableError();
  const available = await bluetooth.getAvailability().catch(() => true);
  if (!available) throw new BluetoothUnavailableError();
  return BleMidiConnection.request(bluetooth);
}

/**
 * Owns the link to the piano: connects over USB automatically (and on hot-plug)
 * and over Bluetooth on request, and delivers the piano's keys and pedal.
 */
export class ConnectionManager {
  private status: ConnectionStatus = { state: 'disconnected', error: null };
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private noteListeners = new Set<(e: NoteEvent) => void>();
  private pedalListeners = new Set<(e: PedalEvent) => void>();
  private access: MIDIAccess | null = null;
  private active: MidiConnection | null = null;
  private activeCleanup: Array<() => void> = [];
  private preferredName: string | null = null;
  private readonly requestAccess: () => Promise<MIDIAccess>;
  private readonly requestBle: () => Promise<MidiConnection>;

  constructor(deps: ConnectionDeps = {}) {
    this.requestAccess = deps.requestMIDIAccess ?? defaultRequestMIDIAccess;
    this.requestBle = deps.requestBle ?? defaultRequestBle;
  }

  /** Svelte-store compatible: calls cb now and on every change. */
  subscribe(cb: (s: ConnectionStatus) => void): () => void {
    cb(this.status);
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  get current(): ConnectionStatus {
    return this.status;
  }

  onNote(cb: (e: NoteEvent) => void): () => void {
    this.noteListeners.add(cb);
    return () => {
      this.noteListeners.delete(cb);
    };
  }

  /** Sustain pedal of the piano. */
  onPedal(cb: (e: PedalEvent) => void): () => void {
    this.pedalListeners.add(cb);
    return () => {
      this.pedalListeners.delete(cb);
    };
  }

  send(event: OutputEvent): void {
    this.active?.send(event);
  }

  /** Asks for MIDI access, connects the best USB input and keeps watching for plug/unplug. */
  async startUsb(preferredName: string | null): Promise<void> {
    this.preferredName = preferredName;
    try {
      this.access = await this.requestAccess();
    } catch (e) {
      const error: ConnectionError = e instanceof MidiAccessError ? e.code : 'midi-denied';
      if (!this.active) this.setStatus({ state: 'disconnected', error });
      return;
    }
    this.access.onstatechange = () => this.syncUsb();
    this.syncUsb();
  }

  listUsbInputs(): PortInfo[] {
    return this.usbInputs().map((p) => ({ id: p.id, name: p.name || p.id }));
  }

  /** Name of the connected device, or null. */
  get deviceName(): string | null {
    return this.active?.name ?? null;
  }

  selectUsbInput(id: string): void {
    const input = this.access?.inputs.get(id);
    if (!input) return;
    this.preferredName = input.name || null;
    this.connectUsb(input);
  }

  /** Opens the Bluetooth chooser. Must be called from a user gesture. */
  async connectBluetooth(): Promise<void> {
    const previous = this.status;
    this.setStatus({ state: 'connecting', kind: 'ble' });
    try {
      this.attach(await this.requestBle());
    } catch (e) {
      // Chrome rejects NotFoundError both for a dismissed chooser and for a switched-off adapter.
      const notFound = e instanceof DOMException && e.name === 'NotFoundError';
      const adapterOff = notFound && /adapter/i.test(e.message);
      const cancelled = notFound && !adapterOff;
      if (this.active) {
        this.setStatus(previous);
      } else {
        const error: ConnectionError | null = cancelled
          ? null
          : adapterOff || e instanceof BluetoothUnavailableError
            ? 'bluetooth-unsupported'
            : 'bluetooth-failed';
        this.setStatus({ state: 'disconnected', error });
      }
    }
  }

  disconnect(): void {
    this.detach();
    this.setStatus({ state: 'disconnected', error: null });
  }

  private usbInputs(): MIDIInput[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].filter((p) => p.state !== 'disconnected');
  }

  private syncUsb(): void {
    if (this.active) return;
    const input = pickPreferredPort(
      this.usbInputs().map((port) => ({ name: port.name || '', port })),
      this.preferredName,
    );
    if (input) this.connectUsb(input.port);
  }

  private connectUsb(input: MIDIInput): void {
    const outputs = [...(this.access?.outputs.values() ?? [])].filter((p) => p.state !== 'disconnected');
    const output =
      outputs.find((o) => o.name === input.name) ??
      pickPreferredPort(outputs.map((port) => ({ name: port.name || '', port })), this.preferredName)?.port ??
      null;
    this.attach(new WebMidiConnection(input, output));
  }

  private attach(connection: MidiConnection): void {
    this.detach();
    this.active = connection;
    this.activeCleanup = [
      connection.onInput((e) => this.dispatch(e)),
      connection.onDisconnect(() => {
        if (this.active !== connection) return;
        this.detach();
        this.setStatus({ state: 'disconnected', error: null });
        this.syncUsb();
      }),
    ];
    this.setStatus({ state: 'connected', kind: connection.kind, name: connection.name });
  }

  private detach(): void {
    for (const cleanup of this.activeCleanup) cleanup();
    this.activeCleanup = [];
    this.active?.close();
    this.active = null;
  }

  private dispatch(event: MidiInputEvent): void {
    if (event.type === 'pedal') {
      for (const cb of this.pedalListeners) cb(event);
      return;
    }
    for (const cb of this.noteListeners) cb(event);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const cb of this.statusListeners) cb(status);
  }
}
