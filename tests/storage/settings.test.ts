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

  it('sends sound to the piano unless another valid output was saved', () => {
    expect(DEFAULT_SETTINGS.soundOutput).toBe('piano');
    const storage = memoryStorage();
    saveSettings({ ...DEFAULT_SETTINGS, soundOutput: 'both' }, storage);
    expect(loadSettings(storage).soundOutput).toBe('both');
    const bad = memoryStorage({ 'piano-professor.settings': JSON.stringify({ soundOutput: 'speakers' }) });
    expect(loadSettings(bad).soundOutput).toBe('piano');
  });

  it("keeps each screen's zoom and falls back to the default when it is invalid", () => {
    expect(DEFAULT_SETTINGS.playView).toEqual({ whiteKeys: null, seconds: 3 });
    expect(DEFAULT_SETTINGS.freePlayView).toEqual({ whiteKeys: null, seconds: 3, center: 60 });

    const storage = memoryStorage();
    saveSettings(
      {
        ...DEFAULT_SETTINGS,
        playView: { whiteKeys: 20.5, seconds: 4 },
        freePlayView: { whiteKeys: 12, seconds: 2, center: 67 },
      },
      storage,
    );
    expect(loadSettings(storage)).toMatchObject({
      playView: { whiteKeys: 20.5, seconds: 4 },
      freePlayView: { whiteKeys: 12, seconds: 2, center: 67 },
    });

    const load = (stored: Record<string, unknown>) =>
      loadSettings(memoryStorage({ 'piano-professor.settings': JSON.stringify(stored) }));
    const badPlayViews = [
      null,
      3,
      { whiteKeys: 3, seconds: 4 },
      { whiteKeys: null },
      { whiteKeys: 60, seconds: 3 },
      { whiteKeys: null, seconds: 20 },
    ];
    for (const playView of badPlayViews) {
      expect(load({ playView }).playView).toEqual(DEFAULT_SETTINGS.playView);
    }
    const badFreePlayViews = [
      { whiteKeys: null, seconds: 3 },
      { whiteKeys: null, seconds: 3, center: 200 },
      { whiteKeys: 'all', seconds: 3, center: 60 },
    ];
    for (const freePlayView of badFreePlayViews) {
      expect(load({ freePlayView }).freePlayView).toEqual(DEFAULT_SETTINGS.freePlayView);
    }
  });
});
