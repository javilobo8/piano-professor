import { derived, writable, type Readable } from 'svelte/store';
import { SoundOutput } from '../audio/sound-output';
import { WebPiano, type WebPianoStatus } from '../audio/web-piano';
import type { Mode } from '../engine/types';
import { noteName, noteNameStyle, translate, type Translate } from '../i18n';
import { ConnectionManager } from '../midi-io/connection-manager';
import type { ConnectionStatus } from '../midi-io/types';
import { openAppDb, type AppDb } from '../storage/db';
import { loadSettings, saveSettings, type HandChoice, type Settings } from '../storage/settings';

export const connection = new ConnectionManager();

export const connectionStatus: Readable<ConnectionStatus> = {
  subscribe: (cb) => connection.subscribe(cb),
};

/** The sampled piano that plays in the browser. */
export const webPiano = new WebPiano();

export const webPianoStatus: Readable<WebPianoStatus> = {
  subscribe: (cb) => webPiano.subscribe(cb),
};

/** Where every sound of the app goes: the piano, the browser or both. */
export const output = new SoundOutput(connection, webPiano);

function createSettingsStore() {
  const store = writable<Settings>(loadSettings());
  store.subscribe((value) => saveSettings(value));
  return store;
}

export const settings = createSettingsStore();
settings.subscribe((s) => output.setTarget(s.soundOutput));

export const t: Readable<Translate> = derived(
  settings,
  ($s): Translate =>
    (key, params) =>
      translate($s.language, key, params),
);

/** Note name in the user's chosen style. */
export const nameNote: Readable<(pitch: number, withOctave?: boolean) => string> = derived(settings, ($s) => {
  const style = noteNameStyle($s.noteNames, $s.language);
  return (pitch: number, withOctave = true) => noteName(pitch, style, withOctave);
});

let db: Promise<AppDb> | null = null;
export function getDb(): Promise<AppDb> {
  db ??= openAppDb();
  return db;
}

export interface PlayRequest {
  songId: string;
  hand: HandChoice;
  mode: Mode;
  speed: number;
}

export type Screen =
  | { name: 'library' }
  | { name: 'setup'; songId: string }
  | { name: 'play'; request: PlayRequest }
  | { name: 'freePlay' }
  | { name: 'settings'; back: Screen };

export const screen = writable<Screen>({ name: 'library' });
