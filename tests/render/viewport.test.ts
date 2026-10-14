import { describe, expect, it } from 'vitest';
import { Viewport } from '../../src/render/viewport';

const ALL = { whiteKeys: null, seconds: 3 };

/** 88 keys in 520 px: 10 px white keys when fitted. */
function full(whiteKeys: number | null = null): Viewport {
  const view = new Viewport(21, 108, { whiteKeys, seconds: 3 });
  view.resize(520);
  return view;
}

describe('Viewport', () => {
  it('starts with the whole range on screen', () => {
    const view = full();
    expect(view.visibleWhites).toBe(52);
    expect(view.zoomed).toBe(false);
    expect(view.scrollX).toBe(0);
    expect(view.layout.whiteWidth).toBe(10);
    expect(view.layout.width).toBe(520);
    expect(view.seconds).toBe(3);
  });

  it('shows at most the range even when more keys were saved', () => {
    const view = new Viewport(48, 72, { whiteKeys: 20, seconds: 3 }); // C3–C5: 15 white keys
    view.resize(300);
    expect(view.visibleWhites).toBe(15);
    expect(view.zoomed).toBe(false);
    expect(view.zoom().whiteKeys).toBe(20);
  });

  it('zooms the keys around the anchor', () => {
    const view = full();
    expect(view.zoomKeys(0.5, 260)).toBe(true);
    expect(view.visibleWhites).toBe(26);
    expect(view.layout.whiteWidth).toBe(20);
    expect(view.layout.width).toBe(1040);
    // The point that was under x = 260 (white key boundary 26) is still under x = 260.
    expect(view.scrollX).toBe(260);
    expect(view.zoomed).toBe(true);
    expect(view.zoom()).toEqual({ whiteKeys: 26, seconds: 3 });
  });

  it('keeps the left edge when zooming at x = 0', () => {
    const view = full();
    view.zoomKeys(0.5, 0);
    expect(view.scrollX).toBe(0);
  });

  it('limits the key zoom between 8 white keys and the whole range', () => {
    const view = full();
    expect(view.zoomKeys(0.01, 260)).toBe(true);
    expect(view.visibleWhites).toBe(8);
    expect(view.canZoomKeys(1)).toBe(false);
    expect(view.zoomKeys(0.5, 260)).toBe(false);
    expect(view.zoomKeys(100, 260)).toBe(true);
    expect(view.visibleWhites).toBe(52);
    expect(view.canZoomKeys(-1)).toBe(false);
    expect(view.zoom().whiteKeys).toBeNull();
  });

  it('never shows fewer keys than a narrow range has', () => {
    const view = new Viewport(60, 71, ALL); // C4–B4: 7 white keys
    view.resize(300);
    expect(view.zoomKeys(0.5, 0)).toBe(false);
    expect(view.visibleWhites).toBe(7);
    expect(view.canZoomKeys(1)).toBe(false);
    expect(view.canZoomKeys(-1)).toBe(false);
  });

  it('only a change in what is visible replaces the saved zoom', () => {
    const view = new Viewport(48, 72, { whiteKeys: 20, seconds: 3 });
    view.resize(300);
    expect(view.zoomKeys(1.25, 150)).toBe(false);
    expect(view.zoom().whiteKeys).toBe(20);
    expect(view.zoomKeys(0.8, 150)).toBe(true);
    expect(view.zoom().whiteKeys).toBe(12);
    view.zoomKeys(10, 150);
    expect(view.zoom().whiteKeys).toBeNull();
  });

  it('pans like a drag and stays inside the keyboard', () => {
    const view = full();
    view.zoomKeys(0.5, 260); // scrollX 260, max 520
    view.panBy(-100);
    expect(view.scrollX).toBe(360);
    view.panBy(10_000);
    expect(view.scrollX).toBe(0);
    view.panBy(-10_000);
    expect(view.scrollX).toBe(520);
    expect(view.maxScroll).toBe(520);
  });

  it('scrolls to a content position, clamped', () => {
    const view = full(26);
    view.scrollTo(300);
    expect(view.scrollX).toBe(300);
    view.scrollTo(1e6);
    expect(view.scrollX).toBe(520);
    view.scrollTo(-5);
    expect(view.scrollX).toBe(0);
  });

  it('keeps the visible keys and the centre on resize', () => {
    const view = full();
    view.zoomKeys(0.5, 260); // left edge at white key 13
    view.resize(1040);
    expect(view.visibleWhites).toBe(26);
    expect(view.layout.whiteWidth).toBe(40);
    expect(view.scrollX).toBe(520);
  });

  it('zooms the time between 1.5 and 8 seconds', () => {
    const view = full();
    expect(view.zoomTime(0.1)).toBe(true);
    expect(view.seconds).toBe(1.5);
    expect(view.canZoomTime(1)).toBe(false);
    expect(view.zoomTime(0.5)).toBe(false);
    expect(view.zoomTime(100)).toBe(true);
    expect(view.seconds).toBe(8);
    expect(view.canZoomTime(-1)).toBe(false);
    expect(view.canZoomTime(1)).toBe(true);
  });

  it('fits back to the whole range and 3 seconds', () => {
    const view = full();
    view.zoomKeys(0.5, 260);
    view.zoomTime(2);
    view.fit();
    expect(view.visibleWhites).toBe(52);
    expect(view.scrollX).toBe(0);
    expect(view.layout.whiteWidth).toBe(10);
    expect(view.zoom()).toEqual({ whiteKeys: null, seconds: 3 });
  });

  it('centres a pitch and reports the white key in the middle', () => {
    const view = full(26); // 20 px keys, C4 is white key 23 (x 460)
    view.centerOn(60);
    expect(view.scrollX).toBe(210);
    expect(view.centerPitch()).toBe(60);
    view.centerOn(61); // C#4 sits on the C4/D4 boundary
    expect(view.scrollX).toBe(220);
    expect(view.centerPitch()).toBe(62);
    view.centerOn(21);
    expect(view.scrollX).toBe(0);
  });

  it('can be centred before its first resize', () => {
    const view = new Viewport(21, 108, { whiteKeys: 26, seconds: 3 });
    view.centerOn(60);
    view.resize(520);
    expect(view.scrollX).toBe(210);
  });

  it('keeps the saved zoom and the centre when the range changes', () => {
    const view = full(26);
    view.centerOn(60);
    view.setRange(48, 72);
    expect(view.visibleWhites).toBe(15);
    expect(view.zoomed).toBe(false);
    expect(view.scrollX).toBe(0);
    expect(view.layout.width).toBe(520);
    view.setRange(21, 108);
    expect(view.visibleWhites).toBe(26);
    expect(view.scrollX).toBe(210);
  });
});
