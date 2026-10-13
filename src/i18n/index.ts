import { en, type MessageKey } from './en';
import { es } from './es';

export type { MessageKey };
export type Language = 'en' | 'es';
export type NoteNameSetting = 'auto' | 'letters' | 'solfege';
export type NoteNameStyle = 'letters' | 'solfege';
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export const LANGUAGES: readonly Language[] = ['en', 'es'];
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', es: 'Español' };

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, es };

export function translate(lang: Language, key: MessageKey, params?: Record<string, string | number>): string {
  const template = dictionaries[lang][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function noteNameStyle(setting: NoteNameSetting, lang: Language): NoteNameStyle {
  if (setting !== 'auto') return setting;
  return lang === 'es' ? 'solfege' : 'letters';
}

const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

/** "C4" / "Do4" for MIDI pitch 60 (scientific octave numbering). */
export function noteName(pitch: number, style: NoteNameStyle, withOctave = true): string {
  const names = style === 'letters' ? LETTERS : SOLFEGE;
  const name = names[((pitch % 12) + 12) % 12];
  return withOctave ? `${name}${Math.floor(pitch / 12) - 1}` : name;
}
