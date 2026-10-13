import type { OutputEvent } from '../engine/types';
import { MidiOutputEncoder, decodeMidiMessage } from './messages';
import type { MidiConnection, NoteEvent } from './types';

/** Web MIDI timestamps share performance.now()'s base; fall back to now if a browser sends nonsense. */
export function eventTime(timeStamp: number, now: number): number {
  return Number.isFinite(timeStamp) && timeStamp > 0 && Math.abs(now - timeStamp) < 1000 ? timeStamp : now;
}

/** USB (or OS-paired) piano through the Web MIDI API. */
export class WebMidiConnection implements MidiConnection {
  readonly kind = 'usb' as const;
  readonly name: string;
  private noteListeners = new Set<(e: NoteEvent) => void>();
  private disconnectListeners = new Set<() => void>();
  private encoder = new MidiOutputEncoder();

  constructor(
    private readonly input: MIDIInput,
    private readonly output: MIDIOutput | null,
  ) {
    this.name = input.name || 'MIDI';
    input.onmidimessage = this.handleMessage;
    input.addEventListener('statechange', this.handleState);
  }

  onNote(cb: (e: NoteEvent) => void): () => void {
    this.noteListeners.add(cb);
    return () => {
      this.noteListeners.delete(cb);
    };
  }

  onDisconnect(cb: () => void): () => void {
    this.disconnectListeners.add(cb);
    return () => {
      this.disconnectListeners.delete(cb);
    };
  }

  send(event: OutputEvent): void {
    if (!this.output) return;
    for (const message of this.encoder.encode(event)) {
      try {
        this.output.send(message);
      } catch {
        // Port went away mid-send; the statechange handler reports it.
      }
    }
  }

  close(): void {
    this.input.onmidimessage = null;
    this.input.removeEventListener('statechange', this.handleState);
    this.noteListeners.clear();
    this.disconnectListeners.clear();
  }

  private handleMessage = (event: MIDIMessageEvent): void => {
    if (!event.data) return;
    const note = decodeMidiMessage(event.data, eventTime(event.timeStamp, performance.now()));
    if (note) for (const cb of this.noteListeners) cb(note);
  };

  private handleState = (): void => {
    if (this.input.state === 'disconnected') {
      for (const cb of [...this.disconnectListeners]) cb();
    }
  };
}
