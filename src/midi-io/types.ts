import type { OutputEvent } from '../engine/types';

export interface NoteEvent {
  type: 'on' | 'off';
  pitch: number;
  /** 0–1 */
  velocity: number;
  /** Same time base as performance.now(). */
  timeMs: number;
}

export type ConnectionKind = 'usb' | 'ble';

/** A live link to the piano, whatever the transport. */
export interface MidiConnection {
  readonly kind: ConnectionKind;
  readonly name: string;
  onNote(cb: (e: NoteEvent) => void): () => void;
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
