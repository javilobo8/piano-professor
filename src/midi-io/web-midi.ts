import type { OutputEvent } from '../engine/types';
import { MidiOutputEncoder, decodeMidiMessage } from './messages';
import type { MidiConnection, MidiInputEvent } from './types';

/** Web MIDI timestamps share performance.now()'s base; fall back to now if a browser sends nonsense. */
export function eventTime(timeStamp: number, now: number): number {
  return Number.isFinite(timeStamp) && timeStamp > 0 && Math.abs(now - timeStamp) < 1000 ? timeStamp : now;
}

/** USB (or OS-paired) piano through the Web MIDI API. */
export class WebMidiConnection implements MidiConnection {
  readonly kind = 'usb' as const;
  readonly name: string;
  private inputListeners = new Set<(e: MidiInputEvent) => void>();
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
    this.inputListeners.clear();
    this.disconnectListeners.clear();
  }

  private handleMessage = (event: MIDIMessageEvent): void => {
    if (!event.data) return;
    const input = decodeMidiMessage(event.data, eventTime(event.timeStamp, performance.now()));
    if (input) for (const cb of this.inputListeners) cb(input);
  };

  private handleState = (): void => {
    if (this.input.state === 'disconnected') {
      for (const cb of [...this.disconnectListeners]) cb();
    }
  };
}
