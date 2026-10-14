import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutKeyboard } from '../../src/render/keyboard-layout';
import { ViewGestures, type ViewGestureHandler } from '../../src/ui/view-gestures';

type Call = [string, ...number[]];

/** 520 × 600 canvas, 10 px white keys: the keyboard starts at y 516. */
function setup() {
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {},
  }) as unknown as HTMLCanvasElement;
  const calls: Call[] = [];
  const handler: ViewGestureHandler = {
    zoomKeys: (factor, anchorX) => calls.push(['zoomKeys', factor, anchorX]),
    zoomTime: (factor) => calls.push(['zoomTime', factor]),
    pan: (dx) => calls.push(['pan', dx]),
    commit: () => calls.push(['commit']),
  };
  const layout = layoutKeyboard(21, 108, 520);
  const gestures = new ViewGestures(canvas, () => ({ layout, cssWidth: 520, cssHeight: 600, scrollX: 0 }), handler);
  const detach = gestures.attach();
  const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId, clientX, clientY });
    canvas.dispatchEvent(event);
    return event;
  };
  const wheel = (init: Partial<Record<'deltaX' | 'deltaY' | 'deltaMode' | 'clientX', number>> & { ctrlKey?: boolean; shiftKey?: boolean }) => {
    const event = Object.assign(new Event('wheel', { cancelable: true }), {
      deltaX: 0,
      deltaY: 0,
      deltaMode: 0,
      clientX: 0,
      clientY: 100,
      ctrlKey: false,
      shiftKey: false,
      ...init,
    });
    canvas.dispatchEvent(event);
    return event;
  };
  return { calls, pointer, wheel, detach };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ViewGestures', () => {
  it('pans with one finger once it has moved 6 px sideways, without losing that movement', () => {
    const { calls, pointer } = setup();
    expect(pointer('pointerdown', 1, 100, 100).defaultPrevented).toBe(true);
    pointer('pointermove', 1, 104, 100);
    expect(calls).toEqual([]);
    pointer('pointermove', 1, 110, 100);
    pointer('pointermove', 1, 115, 130);
    pointer('pointerup', 1, 115, 130);
    expect(calls).toEqual([['pan', 10], ['pan', 5], ['commit']]);
  });

  it('ignores vertical one-finger moves', () => {
    const { calls, pointer } = setup();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 102, 300);
    expect(calls).toEqual([]);
  });

  it('ignores pointers that start on the keyboard', () => {
    const { calls, pointer } = setup();
    expect(pointer('pointerdown', 1, 100, 550).defaultPrevented).toBe(false);
    pointer('pointermove', 1, 200, 550);
    pointer('pointerdown', 2, 300, 100);
    pointer('pointermove', 2, 320, 100);
    pointer('pointerup', 1, 200, 550);
    // Pointer 2 is a plain drag (pointer 1 never joined a pinch), and lifting pointer 1 saves nothing.
    expect(calls).toEqual([['pan', 20]]);
  });

  it('zooms the keys with a sideways pinch, anchored between the fingers', () => {
    const { calls, pointer } = setup();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 200, 110);
    pointer('pointermove', 2, 300, 110);
    expect(calls).toEqual([['zoomKeys', 0.5, 200]]);
  });

  it('zooms the time with an up-and-down pinch', () => {
    const { calls, pointer } = setup();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 110, 200);
    pointer('pointermove', 2, 110, 300);
    expect(calls).toEqual([['zoomTime', 0.5]]);
  });

  it('never measures a pinch narrower than 24 px', () => {
    const { calls, pointer } = setup();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 130, 100);
    pointer('pointermove', 2, 105, 100);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('zoomKeys');
    expect(calls[0][1]).toBeCloseTo(30 / 24);
  });

  it('lets the finger left after a pinch carry on dragging', () => {
    const { calls, pointer } = setup();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 200, 100);
    pointer('pointerup', 2, 200, 100);
    pointer('pointermove', 1, 103, 100);
    expect(calls).toEqual([['commit'], ['pan', 3]]);
  });

  it('ignores a third finger', () => {
    const { calls, pointer } = setup();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 200, 100);
    expect(pointer('pointerdown', 3, 300, 100).defaultPrevented).toBe(false);
    pointer('pointermove', 3, 400, 100);
    pointer('pointerup', 3, 400, 100);
    expect(calls).toEqual([]);
  });

  it('ends a gesture on pointercancel', () => {
    const { calls, pointer } = setup();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointercancel', 1, 100, 100);
    expect(calls).toEqual([['commit']]);
  });

  it('zooms and pans with the wheel and keeps the page still', () => {
    const { calls, wheel } = setup();
    expect(wheel({ ctrlKey: true, deltaY: -100, clientX: 50 }).defaultPrevented).toBe(true);
    wheel({ deltaY: 100 });
    wheel({ shiftKey: true, deltaY: 30 });
    wheel({ deltaX: 40, deltaY: 5 });
    wheel({ deltaMode: 1, deltaY: 3 });
    expect(calls).toHaveLength(5);
    expect(calls[0][0]).toBe('zoomKeys');
    expect(calls[0][1]).toBeCloseTo(Math.exp(-0.25));
    expect(calls[0][2]).toBe(50);
    expect(calls[1][0]).toBe('zoomTime');
    expect(calls[1][1]).toBeCloseTo(Math.exp(0.25));
    expect(calls[2]).toEqual(['pan', -30]);
    expect(calls[3]).toEqual(['pan', -40]);
    expect(calls[4][0]).toBe('zoomTime');
    expect(calls[4][1]).toBeCloseTo(Math.exp(48 * 0.0025));
  });

  it('saves 300 ms after the last wheel event', () => {
    vi.useFakeTimers();
    const { calls, wheel } = setup();
    wheel({ deltaY: 100 });
    vi.advanceTimersByTime(200);
    wheel({ deltaY: 100 });
    vi.advanceTimersByTime(299);
    expect(calls.filter((c) => c[0] === 'commit')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls.filter((c) => c[0] === 'commit')).toHaveLength(1);
  });

  it('saves a pending wheel zoom and stops listening when detached', () => {
    vi.useFakeTimers();
    const { calls, wheel, pointer, detach } = setup();
    wheel({ deltaY: 100 });
    detach();
    expect(calls.filter((c) => c[0] === 'commit')).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    wheel({ deltaY: 100 });
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 150, 100);
    expect(calls).toHaveLength(2);
  });
});
