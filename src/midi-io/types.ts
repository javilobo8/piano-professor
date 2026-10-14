import type { OutputEvent } from '../engine/types';

export interface NoteEvent {
  type: 'on' | 'off';
  pitch: number;
  /** 0–1 */
  velocity: number;
  /** Same time base as performance.now(). */
  timeMs: number;
}

export interface PedalEvent {
  type: 'pedal';
  /** Sustain pedal (CC 64) pressed. */
  down: boolean;
  /** Same time base as performance.now(). */
  timeMs: number;
}

/** What the piano sends us: keys and the sustain pedal. */
export type MidiInputEvent = NoteEvent | PedalEvent;

export type ConnectionKind = 'usb' | 'ble';

/** A live link to the piano, whatever the transport. */
export interface MidiConnection {
  readonly kind: ConnectionKind;
  readonly name: string;
  onInput(cb: (e: MidiInputEvent) => void): () => void;
  onDisconnect(cb: () => void): () => void;
  send(event: OutputEvent): void;
  close(): void;
}

export type ConnectionError =
  | 'midi-unsupported'
  | 'midi-denied'
  | 'bluetooth-unsupported'
  | 'bluetooth-failed';

export type ConnectionStatus =
  | { state: 'disconnected'; error: ConnectionError | null }
  | { state: 'connecting'; kind: ConnectionKind }
  | { state: 'connected'; kind: ConnectionKind; name: string };
