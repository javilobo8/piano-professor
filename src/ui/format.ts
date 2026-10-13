/** 75 -> "1:15" */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/** Index of the measure containing song time t (0 before the song starts). */
export function measureAt(measures: readonly number[], t: number): number {
  let index = 0;
  for (let i = 0; i < measures.length - 1; i++) {
    if (measures[i] <= t) index = i;
    else break;
  }
  return index;
}
