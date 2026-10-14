/** Who started a voice: the app (auto-play, previews, on-screen keys) or the pianist on the piano. */
export type VoiceSource = 'app' | 'player';

export const MAX_VOICES = 48;

interface Entry<V> {
  voice: V;
  source: VoiceSource;
  pitch: number;
}

/**
 * Which voices are sounding, for whom and why. No audio here: every method
 * returns the voices the caller has to cut or fade out.
 */
export class VoiceBook<V> {
  /** Sounding voices, oldest first. */
  private voices: Entry<V>[] = [];
  private pedalDown = false;
  /** Keys the pianist is holding down. */
  private keysDown = new Set<number>();

  constructor(private readonly maxVoices = MAX_VOICES) {}

  get size(): number {
    return this.voices.length;
  }

  /** Adds a voice; returns the voices to cut: the same key of the same source, and the oldest beyond the limit. */
  start(source: VoiceSource, pitch: number, voice: V): V[] {
    const cut: V[] = [];
    this.voices = this.voices.filter((e) => {
      if (e.source !== source || e.pitch !== pitch) return true;
      cut.push(e.voice);
      return false;
    });
    if (source === 'player') this.keysDown.add(pitch);
    this.voices.push({ voice, source, pitch });
    while (this.voices.length > this.maxVoices) cut.push(this.voices.shift()!.voice);
    return cut;
  }

  /** Key up: the voice to fade out, or null when none is sounding or the sustain pedal holds it. */
  release(source: VoiceSource, pitch: number): V | null {
    if (source === 'player') {
      this.keysDown.delete(pitch);
      if (this.pedalDown) return null;
    }
    const index = this.voices.findIndex((e) => e.source === source && e.pitch === pitch);
    return index < 0 ? null : this.voices.splice(index, 1)[0].voice;
  }

  /** The pianist's sustain pedal; lifting it returns the held voices whose key is already up. */
  setPedal(down: boolean): V[] {
    this.pedalDown = down;
    if (down) return [];
    const released: V[] = [];
    this.voices = this.voices.filter((e) => {
      if (e.source !== 'player' || this.keysDown.has(e.pitch)) return true;
      released.push(e.voice);
      return false;
    });
    return released;
  }

  /** Every voice of `source` (both sources when omitted). Releasing the player's also forgets the pedal and keys. */
  releaseAll(source?: VoiceSource): V[] {
    if (source !== 'app') {
      this.pedalDown = false;
      this.keysDown.clear();
    }
    const released: V[] = [];
    this.voices = this.voices.filter((e) => {
      if (source !== undefined && e.source !== source) return true;
      released.push(e.voice);
      return false;
    });
    return released;
  }

  /** A voice that finished playing by itself. */
  ended(voice: V): void {
    const index = this.voices.findIndex((e) => e.voice === voice);
    if (index >= 0) this.voices.splice(index, 1);
  }
}
