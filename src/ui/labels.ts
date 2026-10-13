import type { Mode } from '../engine/types';
import type { MessageKey, NoteNameSetting } from '../i18n';
import type { ConnectionError } from '../midi-io/types';
import type { HandChoice } from '../storage/settings';
import type { Role } from '../song/types';

export const HAND_KEYS: Record<HandChoice, MessageKey> = {
  right: 'hand.right',
  left: 'hand.left',
  both: 'hand.both',
};

export const HAND_SHORT_KEYS: Record<HandChoice, MessageKey> = {
  right: 'hand.short.right',
  left: 'hand.short.left',
  both: 'hand.short.both',
};

export const MODE_KEYS: Record<Mode, MessageKey> = { wait: 'mode.wait', tempo: 'mode.tempo' };

export const ROLE_KEYS: Record<Role, MessageKey> = {
  right: 'role.right',
  left: 'role.left',
  accompaniment: 'role.accompaniment',
  ignore: 'role.ignore',
};

export const ERROR_KEYS: Record<ConnectionError, MessageKey> = {
  'midi-unsupported': 'error.midi-unsupported',
  'midi-denied': 'error.midi-denied',
  'bluetooth-unsupported': 'error.bluetooth-unsupported',
  'bluetooth-failed': 'error.bluetooth-failed',
};

export const NOTE_NAME_KEYS: Record<NoteNameSetting, MessageKey> = {
  auto: 'settings.noteNames.auto',
  letters: 'settings.noteNames.letters',
  solfege: 'settings.noteNames.solfege',
};
