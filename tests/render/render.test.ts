import { describe, expect, it } from 'vitest';
import { isBlack, keyAt, layoutKeyboard, songRange } from '../../src/render/keyboard-layout';
import type { TrailNote } from '../../src/render/note-trail';
import {
  drawFrame,
  drawFreePlayFrame,
  freePlaySide,
  geometry,
  maxNoteDuration,
  trailRect,
  visibleRange,
} from '../../src/render/renderer';
import { pn } from '../helpers/make-midi';

describe('keyboard layout', () => {
  it('knows black keys', () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlack)).toEqual([false, true, false, true, false, false, true]);
    expect(isBlack(22)).toBe(true);
  });

  it('lays out 88 keys with 52 white keys', () => {
    const layout = layoutKeyboard(21, 108, 520);
    expect(layout.keys).toHaveLength(88);
    expect(layout.whiteWidth).toBe(10);
    // C4 is the 24th white key from A0 (A0, B0 + 3 octaves of 7).
    expect(layout.byPitch.get(60)).toEqual({ pitch: 60, x: 230, width: 10, black: false });
    // C#4 straddles the C4/D4 boundary.
    expect(layout.byPitch.get(61)).toEqual({ pitch: 61, x: 237, width: 6, black: true });
  });

  it('lists white keys before black keys', () => {
    const layout = layoutKeyboard(60, 72, 80);
    const firstBlack = layout.keys.findIndex((k) => k.black);
    expect(layout.keys.slice(firstBlack).every((k) => k.black)).toBe(true);
  });

  it('finds the key under a point, black keys first on the upper row', () => {
    const layout = layoutKeyboard(60, 72, 80); // 8 white keys of 10 px
    expect(keyAt(layout, 9.5, true)).toBe(61);
    expect(keyAt(layout, 9.5, false)).toBe(60);
    expect(keyAt(layout, 15, true)).toBe(62);
    expect(keyAt(layout, 200, false)).toBeNull();
  });

  it('fits the range to the song, at least two octaves, ending on white keys', () => {
    expect(songRange([60, 64])).toEqual({ low: 50, high: 74 });
    expect(songRange([30, 100])).toEqual({ low: 29, high: 100 });
    expect(songRange([61, 90])).toEqual({ low: 60, high: 91 });
    expect(songRange([21, 22])).toEqual({ low: 21, high: 45 });
    expect(songRange([])).toEqual({ low: 48, high: 72 });
  });
});

function recordingContext() {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push(`${String(prop)}:${String(target.fillStyle)}`);
        return prop === 'measureText' ? { width: 10 } : args;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('renderer helpers', () => {
  it('keeps the keyboard between 14% and 26% of the height', () => {
    expect(geometry(1000, 800, 10).keyboardHeight).toBe(112);
    expect(geometry(1000, 800, 100).keyboardHeight).toBe(208);
    expect(geometry(1000, 800, 30).keyboardHeight).toBe(150);
  });

  it('finds notes visible in the next 3 seconds, including long notes already sounding', () => {
    const notes = [pn(60, 0, 10), pn(62, 4, 1), pn(64, 5, 1), pn(65, 8.5, 1)];
    expect(visibleRange(notes, 5, maxNoteDuration(notes))).toEqual([0, 3]);
    expect(visibleRange(notes, 5.6, maxNoteDuration(notes))).toEqual([0, 4]);
  });
});

describe('drawFrame', () => {
  it('draws visible notes in their hand colour and lights pressed keys', () => {
    const { ctx, calls } = recordingContext();
    const notes = [pn(60, 1, 1, 'right'), pn(48, 1, 1, 'left'), pn(55, 1, 1, 'accompaniment')];
    drawFrame(ctx, {
      width: 800,
      height: 600,
      layout: layoutKeyboard(48, 72, 800),
      notes,
      maxDuration: 1,
      songTime: 0,
      practiced: new Set(['right']),
      showAccompaniment: false,
      pressed: new Map([[64, 'wrong']]),
      expected: new Set(),
      measures: [0, 2],
      loop: null,
      noteLabel: () => 'C4',
      showPlayedKeys: false,
    });
    const fills = calls.filter((c) => c.startsWith('fill:'));
    expect(fills).toEqual(['fill:#4cc36a', 'fill:#3d8bfd']);
    expect(calls).toContain('fillText:rgba(255, 255, 255, 0.85)');
    expect(calls).toContain('fillRect:#ef4444');
  });

  const listening = {
    width: 800,
    height: 600,
    layout: layoutKeyboard(48, 72, 800),
    maxDuration: 1,
    practiced: new Set<never>(),
    expected: new Set<number>(),
    measures: [0, 2],
    loop: null,
    noteLabel: null,
  };

  it('lights the keys of the notes sounding now when asked, in their hand colour', () => {
    const { ctx, calls } = recordingContext();
    const notes = [pn(48, 1, 1, 'left'), pn(55, 1, 1, 'accompaniment'), pn(60, 1, 1, 'right')];
    drawFrame(ctx, {
      ...listening,
      notes,
      songTime: 1.5,
      showAccompaniment: true,
      pressed: new Map(),
      showPlayedKeys: true,
    });
    expect(calls).toContain('fillRect:#4cc36a');
    expect(calls).toContain('fillRect:#3d8bfd');
    expect(calls).toContain('fillRect:#6b7280');
  });

  it('does not light keys of notes not sounding yet, hidden accompaniment, or when not asked', () => {
    const lit = (input: Partial<Parameters<typeof drawFrame>[1]>) => {
      const { ctx, calls } = recordingContext();
      drawFrame(ctx, {
        ...listening,
        notes: [pn(55, 0, 2, 'accompaniment'), pn(60, 1, 1, 'right')],
        maxDuration: 2,
        songTime: 0.5,
        showAccompaniment: false,
        pressed: new Map(),
        showPlayedKeys: true,
        ...input,
      });
      return calls.filter((c) => c === 'fillRect:#4cc36a' || c === 'fillRect:#6b7280');
    };
    expect(lit({})).toEqual([]);
    expect(lit({ songTime: 1.5, showPlayedKeys: false })).toEqual([]);
    expect(lit({ songTime: 1.5 })).toEqual(['fillRect:#4cc36a']);
  });

  it('shows a key the player holds over the song note on it', () => {
    const { ctx, calls } = recordingContext();
    drawFrame(ctx, {
      ...listening,
      notes: [pn(60, 1, 1, 'right')],
      songTime: 1.5,
      showAccompaniment: true,
      pressed: new Map([[60, 'neutral']]),
      showPlayedKeys: true,
    });
    expect(calls).toContain('fillRect:#a78bfa');
    expect(calls).not.toContain('fillRect:#4cc36a');
  });
});

describe('free play', () => {
  const g = geometry(800, 600, 10); // keyboardTop 516, 172 px/s
  const held: TrailNote = {
    pitch: 60,
    velocity: 0.5,
    startMs: 1000,
    endMs: null,
  };

  it('grows a held bar upward from the keyboard', () => {
    expect(trailRect(held, 2000, g)).toEqual({
      top: g.keyboardTop - g.pxPerSecond,
      bottom: g.keyboardTop,
    });
  });

  it('floats a released bar up at the falling-note speed', () => {
    const released: TrailNote = { ...held, endMs: 2000 };
    const r = trailRect(released, 3000, g);
    expect(r.bottom).toBeCloseTo(g.keyboardTop - g.pxPerSecond);
    expect(r.top).toBeCloseTo(g.keyboardTop - 2 * g.pxPerSecond);
  });

  it('keeps bars at least 4 px tall', () => {
    expect(trailRect({ ...held, startMs: 2000 }, 2000, g)).toEqual({
      top: g.keyboardTop - 4,
      bottom: g.keyboardTop,
    });
  });

  it('colours by side of middle C', () => {
    expect(freePlaySide(59)).toBe('left');
    expect(freePlaySide(60)).toBe('right');
  });

  it('draws held bars in hand colours, labels them and lights the held key', () => {
    const { ctx, calls } = recordingContext();
    drawFreePlayFrame(ctx, {
      width: 800,
      height: 600,
      layout: layoutKeyboard(48, 72, 800),
      notes: [
        { pitch: 48, velocity: 1, startMs: 0, endMs: null },
        { pitch: 64, velocity: 1, startMs: 0, endMs: null },
      ],
      nowMs: 1000,
      noteLabel: () => 'C3',
    });
    const fills = calls.filter((c) => c.startsWith('fill:'));
    expect(fills).toEqual(['fill:#3d8bfd', 'fill:#4cc36a']);
    expect(calls).toContain('fillText:rgba(255, 255, 255, 0.85)');
    expect(calls).toContain('fillRect:#3d8bfd');
    expect(calls).toContain('fillRect:#4cc36a');
  });
});
