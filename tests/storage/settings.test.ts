import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/storage/settings';

describe('settings', () => {
  function memoryStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial));
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, v),
    };
  }

  it('defaults to English and sound on', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.language).toBe('en');
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    saveSettings({ ...DEFAULT_SETTINGS, language: 'es', volume: 0.3, lastHand: 'both' }, storage);
    expect(loadSettings(storage)).toMatchObject({ language: 'es', volume: 0.3, lastHand: 'both' });
  });

  it('ignores invalid values and corrupt data', () => {
    const bad = memoryStorage({
      'piano-professor.settings': JSON.stringify({ language: 'fr', volume: 7, soundOn: 'yes', lastSpeed: 0.5 }),
    });
    expect(loadSettings(bad)).toEqual({ ...DEFAULT_SETTINGS, lastSpeed: 0.5 });
    expect(loadSettings(memoryStorage({ 'piano-professor.settings': '{oops' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
