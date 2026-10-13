import type { Mode } from '../engine/types';
import type { Language, NoteNameSetting } from '../i18n';

export type HandChoice = 'right' | 'left' | 'both';

export interface Settings {
  language: Language;
  noteNames: NoteNameSetting;
  showNoteLabels: boolean;
  showAccompaniment: boolean;
  keyboardRange: 'song' | 'full';
  soundOn: boolean;
  /** 0–1 */
  volume: number;
  /** Name of the last USB MIDI input chosen by hand. */
  preferredDevice: string | null;
  lastMode: Mode;
  lastHand: HandChoice;
  /** 0.25–1.5 */
  lastSpeed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  noteNames: 'auto',
  showNoteLabels: false,
  showAccompaniment: true,
  keyboardRange: 'song',
  soundOn: true,
  volume: 0.8,
  preferredDevice: null,
  lastMode: 'wait',
  lastHand: 'right',
  lastSpeed: 1,
};

const STORAGE_KEY = 'piano-professor.settings';

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const oneOf =
  <T>(...values: T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const inRange = (min: number, max: number) => (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

const validators: { [K in keyof Settings]: (v: unknown) => v is Settings[K] } = {
  language: oneOf<Language>('en', 'es'),
  noteNames: oneOf<NoteNameSetting>('auto', 'letters', 'solfege'),
  showNoteLabels: isBool,
  showAccompaniment: isBool,
  keyboardRange: oneOf<'song' | 'full'>('song', 'full'),
  soundOn: isBool,
  volume: inRange(0, 1),
  preferredDevice: (v: unknown): v is string | null => v === null || typeof v === 'string',
  lastMode: oneOf<Mode>('wait', 'tempo'),
  lastHand: oneOf<HandChoice>('right', 'left', 'both'),
  lastSpeed: inRange(0.25, 1.5),
};

/** Stored settings merged over the defaults; invalid or missing values fall back to defaults. */
export function loadSettings(storage: Storage | null = safeLocalStorage()): Settings {
  let stored: Record<string, unknown> = {};
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') stored = parsed as Record<string, unknown>;
  } catch {
    // Corrupt or unavailable storage: use defaults.
  }
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(validators) as (keyof Settings)[]) {
    const value = stored[key];
    if (validators[key](value)) (settings as Record<keyof Settings, unknown>)[key] = value;
  }
  return settings;
}

export function saveSettings(settings: Settings, storage: Storage | null = safeLocalStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: settings just won't persist.
  }
}
