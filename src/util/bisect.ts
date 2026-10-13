/** Index of the first item whose `start` is >= `value` (items sorted by `start`). */
export function lowerBound(items: readonly { start: number }[], value: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid].start < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
