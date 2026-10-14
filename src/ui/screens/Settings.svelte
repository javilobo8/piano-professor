<script lang="ts">
  import { LANGUAGE_NAMES, LANGUAGES, type Language, type NoteNameSetting } from '../../i18n';
  import type { PortInfo } from '../../midi-io/connection-manager';
  import { connection, connectionStatus, screen, settings, t, type Screen } from '../app-state';
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
</script>

<main class="screen">
  <header class="screen-header">
    <button class="ghost" onclick={() => screen.set(back)} aria-label={$t('common.back')}>←</button>
    <h1>{$t('settings.title')}</h1>
  </header>

  <div class="sections">
    <section class="card">
      <h2>{$t('settings.connection')}</h2>
      <div class="row"><ConnectionBadge /></div>
      {#if $connectionStatus.state === 'disconnected' && $connectionStatus.error}
        <p class="error">{$t(ERROR_KEYS[$connectionStatus.error])}</p>
      {/if}

      {#if inputs.length > 0}
        <label class="field">
          <span>{$t('conn.device')} ({$t('conn.usb')})</span>
          <select
            value={inputs.find((p) => p.name === connectedName)?.id ?? ''}
            onchange={(e) => selectInput(e.currentTarget.value)}
          >
            <option value="" disabled>—</option>
            {#each inputs as input (input.id)}
              <option value={input.id}>{input.name}</option>
            {/each}
          </select>
        </label>
      {:else}
        <p class="dim">{$t('conn.noDevices')}</p>
      {/if}

      <div class="row">
        <button onclick={() => connection.startUsb($settings.preferredDevice)}>{$t('conn.retryUsb')}</button>
        <button onclick={() => connection.connectBluetooth()}>{$t('conn.connectBluetooth')}</button>
      </div>
      <p class="dim small">{$t('conn.bluetoothHint')}</p>
    </section>

    <section class="card">
      <h2>{$t('settings.display')}</h2>
      <label class="field">
        <span>{$t('settings.language')}</span>
        <select bind:value={$settings.language}>
          {#each LANGUAGES as lang (lang)}
            <option value={lang}>{LANGUAGE_NAMES[lang as Language]}</option>
          {/each}
        </select>
      </label>
      <div class="field">
        <span>{$t('settings.noteNames')}</span>
        <Segmented
          label={$t('settings.noteNames')}
          options={NOTE_NAMES.map((n) => ({ value: n, label: $t(NOTE_NAME_KEYS[n]) }))}
          value={$settings.noteNames}
          onchange={(v) => ($settings.noteNames = v)}
        />
      </div>
      <div class="field">
        <span>{$t('settings.keyboardRange')}</span>
        <Segmented
          label={$t('settings.keyboardRange')}
          options={[
            { value: 'song' as const, label: $t('settings.keyboardRange.song') },
            { value: 'full' as const, label: $t('settings.keyboardRange.full') },
          ]}
          value={$settings.keyboardRange}
          onchange={(v) => ($settings.keyboardRange = v)}
        />
      </div>
      <label class="check">
        <input type="checkbox" bind:checked={$settings.showNoteLabels} />
        {$t('settings.showNoteLabels')}
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={$settings.showAccompaniment} />
        {$t('settings.showAccompaniment')}
      </label>
    </section>

    <section class="card">
      <h2>{$t('settings.sound')}</h2>
      <SoundOutputField showHint />
      <label class="check">
        <input type="checkbox" bind:checked={$settings.soundOn} />
        {$t('setup.sound')}
      </label>
      <label class="field">
        <span>{$t('setup.volume')}: {Math.round($settings.volume * 100)}%</span>
        <input type="range" min="0" max="1" step="0.05" bind:value={$settings.volume} />
      </label>
    </section>
  </div>
</main>

<style>
  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
    align-items: start;
  }
  section {
    display: grid;
    gap: 14px;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .field {
    display: grid;
    gap: 8px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--tap);
  }
  .small {
    font-size: 0.85rem;
    margin: 0;
  }
  p {
    margin: 0;
  }
</style>
