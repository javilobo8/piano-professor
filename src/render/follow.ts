import type { PlayableNote, PlayRole } from '../song/types';
import { lowerBound } from '../util/bisect';
import type { Viewport } from './viewport';

/**
 * Where the view should scroll so the next notes of `roles` are on screen, or null to
 * stay. Takes the notes on screen by start time while they fit (with a white key of margin
 * each side) and moves as little as possible to show them. Notes starting together are
 * sorted by pitch, so a chord wider than the view shows its lowest notes.
 */
export function followTarget(
  notes: readonly PlayableNote[],
  maxDuration: number,
  roles: ReadonlySet<PlayRole>,
  songTime: number,
  view: Viewport,
): number | null {
  const width = view.viewWidth;
  if (width <= 0) return null;
  const layout = view.layout;
  const margin = layout.whiteWidth;
  const from = lowerBound(notes, songTime - maxDuration);
  const to = lowerBound(notes, songTime + view.seconds + 0.001);
  let left = Infinity;
  let right = -Infinity;
  for (let i = from; i < to; i++) {
    const n = notes[i];
    if (n.end <= songTime || !roles.has(n.role)) continue;
    const key = layout.byPitch.get(n.pitch);
    if (!key) continue;
    const l = Math.min(left, key.x);
    const r = Math.max(right, key.x + key.width);
    if (left !== Infinity && r - l + 2 * margin > width) break;
    left = l;
    right = r;
  }
  if (left === Infinity) return null;

  const scrollX = view.scrollX;
  let target: number;
  if (right - left + 2 * margin > width) target = (left + right - width) / 2;
  else if (left < scrollX + margin) target = left - margin;
  else if (right > scrollX + width - margin) target = right + margin - width;
  else return null;
  target = Math.min(view.maxScroll, Math.max(0, target));
  return Math.abs(target - scrollX) < 0.5 ? null : target;
}
