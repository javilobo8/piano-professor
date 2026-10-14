const NOTE_FILE_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];

/** A0 */
export const LOWEST_SAMPLE = 21;
/** C8 */
export const HIGHEST_SAMPLE = 108;
const SAMPLE_STEP = 3;

/** Recorded pitches: every minor third from A0 to C8 (A, C, D♯, F♯). */
export const SAMPLE_PITCHES: readonly number[] = Array.from(
  { length: (HIGHEST_SAMPLE - LOWEST_SAMPLE) / SAMPLE_STEP + 1 },
  (_, i) => LOWEST_SAMPLE + i * SAMPLE_STEP,
);

/** File name of a recorded pitch, as Tone.js publishes them: 'A0', 'C1', 'Ds1', 'Fs1'… */
export function sampleName(pitch: number): string {
  return `${NOTE_FILE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

/** The recorded pitch closest to `pitch` (at most a semitone away) and the rate that retunes it. */
export function nearestSample(pitch: number): { samplePitch: number; playbackRate: number } {
  const clamped = Math.min(HIGHEST_SAMPLE, Math.max(LOWEST_SAMPLE, Math.round(pitch)));
  const samplePitch = LOWEST_SAMPLE + Math.round((clamped - LOWEST_SAMPLE) / SAMPLE_STEP) * SAMPLE_STEP;
  return { samplePitch, playbackRate: 2 ** ((clamped - samplePitch) / 12) };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Loudness of a note struck at `velocity` (0–1). */
export function velocityGain(velocity: number): number {
  const v = clamp01(velocity);
  return 0.05 + 0.95 * v * v;
}

/** Low-pass cutoff in Hz: the samples have one dynamic layer, so soft notes are darkened. */
export function velocityCutoff(velocity: number): number {
  return 1500 * (16000 / 1500) ** clamp01(velocity);
}
