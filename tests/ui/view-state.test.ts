import { describe, expect, it } from 'vitest';
import { Viewport } from '../../src/render/viewport';
import { NO_VIEW_STATE, ViewReporter, viewState, type ViewState } from '../../src/ui/view-state';

function view(): Viewport {
  const v = new Viewport(21, 108, { whiteKeys: null, seconds: 3 });
  v.resize(520);
  return v;
}

describe('view state', () => {
  it('offers zooming in but not out or fitting when everything is shown at 3 s', () => {
    expect(viewState(view(), false)).toEqual({
      canZoomKeysIn: true,
      canZoomKeysOut: false,
      canZoomTimeIn: true,
      canZoomTimeOut: true,
      canFit: false,
      showFollow: false,
    });
  });

  it('offers fitting once zoomed in either way', () => {
    const keys = view();
    keys.zoomKeys(0.5, 260);
    expect(viewState(keys, true)).toMatchObject({ canZoomKeysOut: true, canFit: true, showFollow: true });
    const time = view();
    time.zoomTime(2);
    expect(viewState(time, false)).toMatchObject({ canZoomKeysOut: false, canFit: true });
  });

  it('starts with every button off', () => {
    expect(Object.values(NO_VIEW_STATE).every((v) => v === false)).toBe(true);
  });

  it('reports only changes', () => {
    const sent: ViewState[] = [];
    const reporter = new ViewReporter((s) => sent.push(s));
    const v = view();
    reporter.report(v);
    reporter.report(v);
    v.zoomKeys(0.5, 260);
    reporter.report(v);
    reporter.report(v, true);
    reporter.report(v, true);
    expect(sent.map((s) => [s.canFit, s.showFollow])).toEqual([
      [false, false],
      [true, false],
      [true, true],
    ]);
  });
});
