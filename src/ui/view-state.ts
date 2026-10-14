import { DEFAULT_SECONDS, type Viewport } from '../render/viewport';

/** What the zoom buttons can do right now. */
export interface ViewState {
  canZoomKeysIn: boolean;
  canZoomKeysOut: boolean;
  canZoomTimeIn: boolean;
  canZoomTimeOut: boolean;
  /** Something differs from the whole keyboard at the default seconds. */
  canFit: boolean;
  /** Play only: zoomed in and not following the notes. */
  showFollow: boolean;
}

export const NO_VIEW_STATE: ViewState = {
  canZoomKeysIn: false,
  canZoomKeysOut: false,
  canZoomTimeIn: false,
  canZoomTimeOut: false,
  canFit: false,
  showFollow: false,
};

export function viewState(view: Viewport, showFollow: boolean): ViewState {
  return {
    canZoomKeysIn: view.canZoomKeys(1),
    canZoomKeysOut: view.canZoomKeys(-1),
    canZoomTimeIn: view.canZoomTime(1),
    canZoomTimeOut: view.canZoomTime(-1),
    canFit: view.zoomed || Math.abs(view.seconds - DEFAULT_SECONDS) > 1e-6,
    showFollow,
  };
}

function sameViewState(a: ViewState, b: ViewState): boolean {
  return (Object.keys(a) as (keyof ViewState)[]).every((key) => a[key] === b[key]);
}

/** Sends the buttons' state to the screen, only when it changes. */
export class ViewReporter {
  private last: ViewState | null = null;

  constructor(private readonly onChange: (state: ViewState) => void) {}

  report(view: Viewport, showFollow = false): void {
    const next = viewState(view, showFollow);
    if (this.last && sameViewState(this.last, next)) return;
    this.last = next;
    this.onChange(next);
  }
}

/** How a controller gets its saved zoom, reports the buttons' state and saves the zoom. */
export interface ViewOptions<Z> {
  zoom: Z;
  onChange: (state: ViewState) => void;
  onCommit: (zoom: Z) => void;
}
