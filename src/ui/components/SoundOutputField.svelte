<script lang="ts">
  import type { SoundTarget } from '../../audio/sound-output';
  import { settings, t, webPiano, webPianoStatus } from '../app-state';
  import { SOUND_OUTPUT_KEYS } from '../labels';
  import Segmented from './Segmented.svelte';

  /** Explains that the piano keeps sounding its own keys (Settings only). */
  let { showHint = false }: { showHint?: boolean } = $props();

  const TARGETS: SoundTarget[] = ['piano', 'web', 'both'];
</script>

<div class="field">
  <span>{$t('settings.soundOutput')}</span>
  <Segmented
    label={$t('settings.soundOutput')}
    options={TARGETS.map((v) => ({ value: v, label: $t(SOUND_OUTPUT_KEYS[v]) }))}
    value={$settings.soundOutput}
    onchange={(v) => ($settings.soundOutput = v)}
  />
  {#if $settings.soundOutput !== 'piano'}
    {#if $webPianoStatus === 'loading'}
      <small class="dim">{$t('settings.soundLoading')}</small>
    {:else if $webPianoStatus === 'error'}
      <div class="retry">
        <span class="error">{$t('settings.soundError')}</span>
        <button onclick={() => void webPiano.load()}>{$t('settings.soundRetry')}</button>
      </div>
    {/if}
    {#if showHint && $settings.soundOutput === 'web'}
      <small class="dim">{$t('settings.soundWebHint')}</small>
    {/if}
  {/if}
</div>

<style>
  .field {
    display: grid;
    gap: 8px;
  }
  .retry {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
</style>
