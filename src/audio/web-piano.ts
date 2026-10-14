import { SAMPLE_PITCHES, nearestSample, sampleName, velocityCutoff, velocityGain } from './samples';
import { VoiceBook, type VoiceSource } from './voices';

export type WebPianoStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface WebPianoDeps {
  createContext?: () => AudioContext;
  fetchSample?: (name: string) => Promise<ArrayBuffer>;
}

interface Voice {
  node: AudioBufferSourceNode;
  gain: GainNode;
}

interface Fade {
  /** Seconds for the level to fall by ~63 %. */
  timeConstant: number;
  /** Seconds until the voice is stopped. */
  stopAfter: number;
}

const MASTER_GAIN = 0.8;
/** A key let go: the damper stops the string. */
const RELEASE: Fade = { timeConstant: 0.1, stopAfter: 1 };
/** A voice cut to make room (same key again, or too many voices). */
const CUT: Fade = { timeConstant: 0.015, stopAfter: 0.1 };

function defaultCreateContext(): AudioContext {
  return new AudioContext({ latencyHint: 'interactive' });
}

async function defaultFetchSample(name: string): Promise<ArrayBuffer> {
  const response = await fetch(new URL(`samples/piano/${name}.mp3`, document.baseURI));
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

/** Sampled grand piano played through Web Audio. Silent until load() has finished. */
export class WebPiano {
  private ctx: AudioContext | null = null;
  private output: AudioNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private readonly book = new VoiceBook<Voice>();
  private state: WebPianoStatus = 'idle';
  private listeners = new Set<(s: WebPianoStatus) => void>();
  private readonly createContext: () => AudioContext;
  private readonly fetchSample: (name: string) => Promise<ArrayBuffer>;

  constructor(deps: WebPianoDeps = {}) {
    this.createContext = deps.createContext ?? defaultCreateContext;
    this.fetchSample = deps.fetchSample ?? defaultFetchSample;
  }

  /** Svelte-store compatible: calls cb now and on every change. */
  subscribe(cb: (s: WebPianoStatus) => void): () => void {
    cb(this.state);
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  get status(): WebPianoStatus {
    return this.state;
  }

  /** Downloads and decodes the samples. Does nothing while loading or once ready; retries after an error. */
  async load(): Promise<void> {
    if (this.state === 'loading' || this.state === 'ready') return;
    this.setStatus('loading');
    try {
      const ctx = this.ensureContext();
      const decoded = await Promise.all(
        SAMPLE_PITCHES.map(
          async (pitch) => [pitch, await ctx.decodeAudioData(await this.fetchSample(sampleName(pitch)))] as const,
        ),
      );
      this.buffers = new Map(decoded);
      this.setStatus('ready');
    } catch {
      this.setStatus('error');
    }
  }

  /** Browsers keep audio suspended until a user gesture: call from one (and when the app is shown again). */
  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  /** `velocity` 0–1. */
  noteOn(source: VoiceSource, pitch: number, velocity: number): void {
    const ctx = this.ctx;
    const output = this.output;
    if (this.state !== 'ready' || !ctx || !output) return;
    const { samplePitch, playbackRate } = nearestSample(pitch);
    const buffer = this.buffers.get(samplePitch);
    if (!buffer) return;
    this.resume();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = playbackRate;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = velocityCutoff(velocity);
    const gain = ctx.createGain();
    gain.gain.value = velocityGain(velocity);
    node.connect(filter).connect(gain).connect(output);
    const voice: Voice = { node, gain };
    node.onended = () => {
      this.book.ended(voice);
      gain.disconnect();
    };
    node.start(ctx.currentTime);
    for (const old of this.book.start(source, pitch, voice)) this.fade(old, CUT);
  }

  noteOff(source: VoiceSource, pitch: number): void {
    const voice = this.book.release(source, pitch);
    if (voice) this.fade(voice, RELEASE);
  }

  /** The pianist's sustain pedal. */
  setPedal(down: boolean): void {
    for (const voice of this.book.setPedal(down)) this.fade(voice, RELEASE);
  }

  /** Releases every voice of `source`, or every voice when omitted. */
  allNotesOff(source?: VoiceSource): void {
    for (const voice of this.book.releaseAll(source)) this.fade(voice, RELEASE);
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = this.createContext();
    // A limiter for loud chords only: the samples peak at −8 to −19 dBFS, so single notes pass untouched.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(limiter);
    this.ctx = ctx;
    this.output = master;
    return ctx;
  }

  private fade(voice: Voice, fade: Fade): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, fade.timeConstant);
    try {
      voice.node.stop(now + fade.stopAfter);
    } catch {
      // Already stopped.
    }
  }

  private setStatus(status: WebPianoStatus): void {
    this.state = status;
    for (const cb of this.listeners) cb(status);
  }
}
