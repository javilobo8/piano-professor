import { describe, expect, it } from 'vitest';
import { noteName, noteNameStyle, translate } from '../../src/i18n';
import { en } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';

describe('i18n', () => {
  it('has the same keys in English and Spanish, none empty', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(en), ...Object.values(es)]) expect(value.trim()).not.toBe('');
  });

  it('uses the same placeholders in both languages', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('translates and fills placeholders', () => {
    expect(translate('en', 'library.title')).toBe('Library');
    expect(translate('es', 'library.title')).toBe('Biblioteca');
    expect(translate('es', 'conn.connected', { name: 'FP-10' })).toBe('Conectado · FP-10');
    expect(translate('en', 'play.loopPass', { n: 2 })).toBe('Pass 2: {percent}%');
  });

  it('names notes in letters or solfège', () => {
    expect(noteName(60, 'letters')).toBe('C4');
    expect(noteName(61, 'solfege')).toBe('Do#4');
    expect(noteName(21, 'letters')).toBe('A0');
    expect(noteName(67, 'solfege', false)).toBe('Sol');
  });

  it('picks the note style from the language when automatic', () => {
    expect(noteNameStyle('auto', 'en')).toBe('letters');
    expect(noteNameStyle('auto', 'es')).toBe('solfege');
    expect(noteNameStyle('letters', 'es')).toBe('letters');
  });
});
