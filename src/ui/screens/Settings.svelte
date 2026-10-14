<script lang="ts">
  import Bluetooth from '@lucide/svelte/icons/bluetooth';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Piano from '@lucide/svelte/icons/piano';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import Usb from '@lucide/svelte/icons/usb';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import { LANGUAGE_NAMES, LANGUAGES, type Language, type NoteNameSetting } from '../../i18n';
  import type { PortInfo } from '../../midi-io/connection-manager';
  import { connection, connectionStatus, screen, settings, t, type Screen } from '../app-state';
  import AppHeader from '../components/AppHeader.svelte';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import Segmented from '../components/Segmented.svelte';
  import SoundOutputField from '../components/SoundOutputField.svelte';
  import { ERROR_KEYS, NOTE_NAME_KEYS } from '../labels';

  let { back }: { back: Screen } = $props();

  const NOTE_NAMES: NoteNameSetting[] = ['auto', 'letters', 'solfege'];

  let inputs = $state<PortInfo[]>([]);

  $effect(() => {
    // Re-read the device list whenever the connection changes.
    void $connectionStatus;
    inputs = connection.listUsbInputs();
  });

  function selectInput(id: string) {
    const port = inputs.find((p) => p.id === id);
    connection.selectUsbInput(id);
    if (port) settings.update((s) => ({ ...s, preferredDevice: port.name }));
  }

  const connectedName = $derived($connectionStatus.state === 'connected' ? $connectionStatus.name : '');
  const volumePercent = $derived(Math.round($settings.volume * 100));
</script>

<main class="screen">
  <AppHeader title={$t('settings.title')} onback={() => screen.set(back)} showSettings={false} />

  <div class="sections">
    <section class="card" aria-labelledby="connection-title">
      <div class="card-head">
        <span class="card-icon"><Piano size={18} aria-hidden="true" /></span>
        <h2 id="connection-title">{$t('settings.connection')}</h2>
      </div>

      <div class="status"><ConnectionBadge /></div>
      {#if $connectionStatus.state === 'disconnected' && $connectionStatus.error}
        <p class="notice" role="alert">
          <CircleAlert size={20} aria-hidden="true" />{$t(ERROR_KEYS[$connectionStatus.error])}
        </p>
      {/if}

      {#if inputs.length > 0}
        <div class="field">
          <label class="label" for="usb-device">{$t('conn.device')} ({$t('conn.usb')})</label>
          <select
            id="usb-device"
            value={inputs.find((p) => p.name === connectedName)?.id ?? ''}
            onchange={(e) => selectInput(e.currentTarget.value)}
          >
            <option value="" disabled>—</option>
            {#each inputs as input (input.id)}
              <option value={input.id}>{input.name}</option>
            {/each}
          </select>
        </div>
      {:else}
        <p class="hint">{$t('conn.noDevices')}</p>
      {/if}

      <div class="actions">
        <button onclick={() => connection.startUsb($settings.preferredDevice)}
          ><Usb size={20} aria-hidden="true" /><span>{$t('conn.retryUsb')}</span></button
        >
        <button onclick={() => connection.connectBluetooth()} aria-describedby="bluetooth-hint"
          ><Bluetooth size={20} aria-hidden="true" /><span>{$t('conn.connectBluetooth')}</span></button
        >
        <p class="hint" id="bluetooth-hint">{$t('conn.bluetoothHint')}</p>
      </div>
    </section>

    <section class="card" aria-labelledby="display-title">
      <div class="card-head">
        <span class="card-icon"><SettingsIcon size={18} aria-hidden="true" /></span>
        <h2 id="display-title">{$t('settings.display')}</h2>
      </div>

      <div class="field">
        <label class="label" for="language">{$t('settings.language')}</label>
        <select id="language" bind:value={$settings.language}>
          {#each LANGUAGES as lang (lang)}
            <option value={lang}>{LANGUAGE_NAMES[lang as Language]}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <span class="label">{$t('settings.noteNames')}</span>
        <Segmented
          full
          label={$t('settings.noteNames')}
          options={NOTE_NAMES.map((n) => ({ value: n, label: $t(NOTE_NAME_KEYS[n]) }))}
          value={$settings.noteNames}
          onchange={(v) => ($settings.noteNames = v)}
        />
      </div>

      <div class="field">
        <span class="label">{$t('settings.keyboardRange')}</span>
        <Segmented
          full
          label={$t('settings.keyboardRange')}
          options={[
            { value: 'song' as const, label: $t('settings.keyboardRange.song') },
            { value: 'full' as const, label: $t('settings.keyboardRange.full') },
          ]}
          value={$settings.keyboardRange}
          onchange={(v) => ($settings.keyboardRange = v)}
        />
      </div>

      <div class="switches">
        <label class="switch-row">
          <span>{$t('settings.showNoteLabels')}</span>
          <input type="checkbox" class="switch" role="switch" bind:checked={$settings.showNoteLabels} />
        </label>
        <label class="switch-row">
          <span>{$t('settings.showAccompaniment')}</span>
          <input type="checkbox" class="switch" role="switch" bind:checked={$settings.showAccompaniment} />
        </label>
      </div>
    </section>

    <section class="card" aria-labelledby="sound-title">
      <div class="card-head">
        <span class="card-icon"><Volume2 size={18} aria-hidden="true" /></span>
        <h2 id="sound-title">{$t('settings.sound')}</h2>
      </div>

      <SoundOutputField showHint />

      <div class="switches">
        <label class="switch-row">
          <span>{$t('setup.sound')}</span>
          <input type="checkbox" class="switch" role="switch" bind:checked={$settings.soundOn} />
        </label>
      </div>

      <div class="field">
        <div class="field-head">
          <label class="label" for="volume">{$t('setup.volume')}</label>
          <span class="pill value">{volumePercent}%</span>
        </div>
        <input
          id="volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={$settings.volume}
          aria-valuetext="{volumePercent}%"
          style:--fill={volumePercent + '%'}
        />
      </div>
    </section>
  </div>
</main>

<style>
  /* One column on phones; two on tablets; three side by side on wide screens. */
  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
    align-items: start;
    gap: 12px;
    margin-top: 8px;
  }
  .card {
    display: grid;
    align-content: start;
    gap: 16px;
    min-width: 0;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .card-head h2 {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .card-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 1px solid rgba(124, 92, 255, 0.35);
    border-radius: var(--radius-sm);
    background: linear-gradient(135deg, rgba(124, 92, 255, 0.28), rgba(34, 211, 238, 0.16));
    color: var(--cyan);
  }

  /* The badge keeps its own width; a long device name ellipsises inside it. */
  .status {
    display: flex;
    min-width: 0;
  }

  /* ---------- Fields ---------- */

  .field {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .field select {
    width: 100%;
    min-width: 0;
  }
  .field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 24px;
  }
  /* Fixed width so the pill doesn't jump as the digits change. */
  .value {
    justify-content: center;
    min-width: 60px;
  }
  /* The range's own 44 px touch area already gives breathing room. */
  .field input[type='range'] {
    margin: -6px 0;
  }
  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: 13px;
    line-height: 1.4;
  }

  /* Toggle rows: the whole row is the touch target, divided by a hairline. */
  .switches {
    display: grid;
    margin: -4px 0;
  }
  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: var(--tap);
    padding: 4px 0;
    cursor: pointer;
  }
  .switch-row + .switch-row {
    border-top: 1px solid var(--border);
  }
  .switch-row > span {
    min-width: 0;
    font-weight: 600;
  }

  /* ---------- Connection ---------- */

  .actions {
    display: grid;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .actions button {
    min-width: 0;
  }
  .actions button > span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .notice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 0;
    padding: 12px 16px;
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    background: rgba(248, 113, 113, 0.08);
    color: var(--danger);
    font-size: 14px;
    font-weight: 600;
  }
  .notice > :global(svg) {
    flex: none;
    margin-top: -1px;
  }

  /* ---------- Tablet and up ---------- */

  @media (min-width: 600px) {
    .sections {
      gap: 20px;
    }
  }

  @media (min-width: 1024px) {
    .sections {
      gap: 24px;
    }
  }
</style>
