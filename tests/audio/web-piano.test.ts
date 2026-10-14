import { describe, expect, it, vi } from 'vitest';
import { WebPiano, type WebPianoStatus } from '../../src/audio/web-piano';

class FakeParam {
  events: string[] = [];
  constructor(public value: number) {}
  cancelScheduledValues(t: number) {
    this.events.push(`cancel ${t}`);
    return this;
  }
  setTargetAtTime(value: number, t: number, timeConstant: number) {
    this.events.push(`target ${value} ${t} ${timeConstant}`);
    return this;
  }
}

class FakeNode {
  connected: unknown[] = [];
  connect<T>(node: T): T {
    this.connected.push(node);
    return node;
  }
  disconnect() {
    this.connected = [];
  }
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  start(t: number) {
    this.startedAt = t;
  }
  stop(t: number) {
    this.stoppedAt = t;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeFilter extends FakeNode {
  type = '';
  frequency = new FakeParam(350);
}

class FakeCompressor extends FakeNode {
  // Web Audio's defaults.
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
}

class FakeContext {
  state = 'running';
  currentTime = 10;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  compressors: FakeCompressor[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createGain() {
    return new FakeGain();
  }
  createBiquadFilter() {
    return new FakeFilter();
  }
  createDynamicsCompressor() {
    const compressor = new FakeCompressor();
    this.compressors.push(compressor);
    return compressor;
  }
  async decodeAudioData(data: ArrayBuffer) {
    return { name: new TextDecoder().decode(data) };
  }
}

/** The gain node of a voice: source → filter → gain. */
function gainOf(source: FakeSource): FakeGain {
  return (source.connected[0] as FakeFilter).connected[0] as FakeGain;
}

function setup() {
  const ctx = new FakeContext();
  const fetched: string[] = [];
  const failing = { name: null as string | null };
  const piano = new WebPiano({
    createContext: () => ctx as unknown as AudioContext,
    fetchSample: async (name) => {
      fetched.push(name);
      if (name === failing.name) throw new Error('404');
      return new TextEncoder().encode(name).buffer as ArrayBuffer;
    },
  });
  return { ctx, fetched, failing, piano };
}

describe('WebPiano', () => {
  it('is silent until loaded', () => {
    const { ctx, piano } = setup();
    piano.noteOn('app', 60, 1);
    expect(piano.status).toBe('idle');
    expect(ctx.sources).toHaveLength(0);
  });

  it('loads every sample once and reports loading, then ready', async () => {
    const { fetched, piano } = setup();
    const statuses: WebPianoStatus[] = [];
    piano.subscribe((s) => statuses.push(s));
    await piano.load();
    await piano.load();
    expect(statuses).toEqual(['idle', 'loading', 'ready']);
    expect(fetched).toHaveLength(30);
    expect(fetched).toEqual(expect.arrayContaining(['A0', 'Fs4', 'C8']));
  });

  it('plays a note from the nearest sample, at its pitch and loudness', async () => {
    const { ctx, piano } = setup();
    await piano.load();
    piano.noteOn('app', 61, 1);
    const [source] = ctx.sources;
    expect(source.buffer).toEqual({ name: 'C4' });
    expect(source.playbackRate.value).toBeCloseTo(2 ** (1 / 12));
    expect(gainOf(source).gain.value).toBeCloseTo(1);
    expect(source.startedAt).toBe(10);
  });

  it('limits only loud chords, so single notes keep their dynamics', async () => {
    const { ctx, piano } = setup();
    await piano.load();
    const [limiter] = ctx.compressors;
    // The samples peak at −8 to −19 dBFS: one note at full velocity stays under the threshold.
    expect(limiter.threshold.value).toBeGreaterThanOrEqual(-8);
    expect(limiter.knee.value).toBeLessThanOrEqual(6);
  });

  it('fades a released note out', async () => {
    const { ctx, piano } = setup();
    await piano.load();
    piano.noteOn('app', 60, 0.5);
    piano.noteOff('app', 60);
    const [source] = ctx.sources;
    expect(gainOf(source).gain.events).toContain('target 0 10 0.1');
    expect(source.stoppedAt).toBe(11);
  });

  it('cuts the previous voice when the same key is struck again', async () => {
    const { ctx, piano } = setup();
    await piano.load();
    piano.noteOn('player', 60, 0.8);
    piano.noteOn('player', 60, 0.8);
    expect(ctx.sources[0].stoppedAt).toBeCloseTo(10.1);
    expect(gainOf(ctx.sources[0]).gain.events).toContain('target 0 10 0.015');
    expect(ctx.sources[1].stoppedAt).toBeNull();
  });

  it('holds the player notes while the sustain pedal is down', async () => {
    const { ctx, piano } = setup();
    await piano.load();
    piano.setPedal(true);
    piano.noteOn('player', 60, 0.8);
    piano.noteOff('player', 60);
    expect(ctx.sources[0].stoppedAt).toBeNull();
    piano.setPedal(false);
    expect(ctx.sources[0].stoppedAt).toBe(11);
  });

  it('app all-notes-off leaves the player notes sounding', async () => {
    const { ctx, piano } = setup();
    await piano.load();
    piano.noteOn('player', 60, 0.8);
    piano.noteOn('app', 64, 0.8);
    piano.allNotesOff('app');
    expect(ctx.sources[0].stoppedAt).toBeNull();
    expect(ctx.sources[1].stoppedAt).toBe(11);
    piano.allNotesOff();
    expect(ctx.sources[0].stoppedAt).toBe(11);
  });

  it('forgets a voice that ended on its own', async () => {
    const { ctx, piano } = setup();
    await piano.load();
    piano.noteOn('player', 60, 0.8);
    ctx.sources[0].onended?.();
    piano.noteOff('player', 60);
    expect(ctx.sources[0].stoppedAt).toBeNull();
  });

  it('reports an error when a sample fails, and loads again on retry', async () => {
    const { failing, piano } = setup();
    failing.name = 'C4';
    await piano.load();
    expect(piano.status).toBe('error');
    failing.name = null;
    await piano.load();
    expect(piano.status).toBe('ready');
  });

  it('reports an error without Web Audio', async () => {
    const piano = new WebPiano({
      createContext: () => {
        throw new ReferenceError('AudioContext is not defined');
      },
      fetchSample: async () => new ArrayBuffer(0),
    });
    await piano.load();
    expect(piano.status).toBe('error');
  });

  it('resumes a suspended audio context', async () => {
    const { ctx, piano } = setup();
    piano.resume();
    await piano.load();
    ctx.state = 'suspended';
    piano.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });
});
