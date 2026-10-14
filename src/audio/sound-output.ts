import type { OutputEvent } from '../engine/types';
import type { ConnectionStatus, NoteEvent, PedalEvent } from '../midi-io/types';
import type { VoiceSource } from './voices';

export type SoundTarget = 'piano' | 'web' | 'both';

/** Where the app's own notes go: auto-play, previews and the on-screen / PC keyboard. */
export interface SoundSink {
  send(event: OutputEvent): void;
}

/** What the output needs from the connection to the piano (ConnectionManager). */
export interface PianoLink {
  send(event: OutputEvent): void;
  onNote(cb: (e: NoteEvent) => void): () => void;
  onPedal(cb: (e: PedalEvent) => void): () => void;
  subscribe(cb: (s: ConnectionStatus) => void): () => void;
}

/** What the output needs from the browser piano (WebPiano). */
export interface BrowserPiano {
  load(): Promise<void>;
  noteOn(source: VoiceSource, pitch: number, velocity: number): void;
  noteOff(source: VoiceSource, pitch: number): void;
  setPedal(down: boolean): void;
  allNotesOff(source?: VoiceSource): void;
}

const toPiano = (target: SoundTarget) => target !== 'web';
const toWeb = (target: SoundTarget) => target !== 'piano';

/**
 * Sends the app's sound to the piano (MIDI), the browser piano or both. Keys and
 * pedal played on the piano always sound on the piano itself; when the browser is
 * a target they also sound there.
 */
export class SoundOutput implements SoundSink {
  private current: SoundTarget = 'piano';

  constructor(
    private readonly link: PianoLink,
    private readonly webPiano: BrowserPiano,
  ) {
    link.onNote((e) => {
      if (!toWeb(this.current)) return;
      if (e.type === 'on') webPiano.noteOn('player', e.pitch, e.velocity);
      else webPiano.noteOff('player', e.pitch);
    });
    link.onPedal((e) => {
      if (toWeb(this.current)) webPiano.setPedal(e.down);
    });
    // A dropped link never delivers the note-offs: release what the piano was holding.
    link.subscribe((status) => {
      if (status.state !== 'connected') webPiano.allNotesOff('player');
    });
  }

  get target(): SoundTarget {
    return this.current;
  }

  setTarget(target: SoundTarget): void {
    const previous = this.current;
    if (target === previous) return;
    this.current = target;
    if (toWeb(previous) && !toWeb(target)) this.webPiano.allNotesOff();
    if (toPiano(previous) && !toPiano(target)) this.link.send({ type: 'allNotesOff' });
    if (toWeb(target) && !toWeb(previous)) void this.webPiano.load().catch(() => undefined);
  }

  send(event: OutputEvent): void {
    if (toPiano(this.current)) this.link.send(event);
    if (!toWeb(this.current)) return;
    switch (event.type) {
      case 'noteOn':
        this.webPiano.noteOn('app', event.pitch, event.velocity / 127);
        break;
      case 'noteOff':
        this.webPiano.noteOff('app', event.pitch);
        break;
      case 'allNotesOff':
        this.webPiano.allNotesOff('app');
        break;
    }
  }
}
