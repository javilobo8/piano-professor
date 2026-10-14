<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { practicedRoles } from '../../engine/session';
  import type { Mode } from '../../engine/types';
  import { applyHandConfig, autoHandConfig } from '../../song/hands';
  import type { HandConfig, Role, Song } from '../../song/types';
  import type { HandChoice } from '../../storage/settings';
  import { saveHandConfig } from '../../storage/songs';
  import { getDb, nameNote, output, screen, settings, t } from '../app-state';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import Segmented from '../components/Segmented.svelte';
  import SoundOutputField from '../components/SoundOutputField.svelte';
  import { HAND_KEYS, MODE_KEYS, ROLE_KEYS } from '../labels';
  import { Previewer } from '../previewer';
  import { loadSong } from '../song-loader';

  let { songId }: { songId: string } = $props();

  const ROLES: Role[] = ['right', 'left', 'accompaniment', 'ignore'];
  const HANDS: HandChoice[] = ['right', 'left', 'both'];
  const MODES: Mode[] = ['wait', 'tempo'];

  let song = $state<Song | null>(null);
  let handConfig = $state<HandConfig | null>(null);
  let failed = $state(false);
  /** Split pitch shown while dragging the slider; null when not dragging. */
  let draftSplit = $state<number | null>(null);
  let hand = $state<HandChoice>($settings.lastHand);
  let mode = $state<Mode>($settings.lastMode);
  let speedPercent = $state(Math.round($settings.lastSpeed * 100));
  /** Index of the track being previewed, or null when nothing is playing. */
  let previewing = $state<number | null>(null);
  const previewer = new Previewer(output);

  /** Notes of the song under the current track roles or split (ignored tracks left out). */
  const playable = $derived(song && handConfig ? applyHandConfig(song, handConfig) : []);
  /** False when the chosen hand gets no notes under the current track roles or split. */
  const handHasNotes = $derived.by(() => {
    if (!song || !handConfig) return true;
    const roles = practicedRoles(hand);
    return playable.some((n) => roles.has(n.role));
  });

  onMount(async () => {
    const loaded = await loadSong(songId);
    if (!loaded) {
      failed = true;
      return;
    }
    song = loaded.song;
    handConfig = loaded.handConfig;
  });

  onDestroy(() => previewer.stop());

  async function updateConfig(next: HandConfig) {
    handConfig = next;
    await saveHandConfig(await getDb(), songId, $state.snapshot(next) as HandConfig);
  }

  function setTrackRole(track: number, role: Role) {
    if (!handConfig) return;
    void updateConfig({ ...handConfig, trackRoles: { ...handConfig.trackRoles, [track]: role } });
  }

  function setSplit(enabled: boolean) {
    if (!handConfig || !song) return;
    // Back to tracks: keep the roles the user chose; fall back to the automatic ones only if there are none.
    const keep = enabled || Object.keys(handConfig.trackRoles).length > 0;
    const tracks = keep ? handConfig.trackRoles : autoHandConfig(song).trackRoles;
    void updateConfig({ ...handConfig, method: enabled ? 'split' : 'tracks', trackRoles: tracks });
  }

  function togglePreview(track: number) {
    if (!song) return;
    if (previewing === track) {
      previewer.stop();
      previewing = null;
      return;
    }
    const notes = song.notes.filter((n) => n.track === track).map((n) => ({ ...n, role: 'right' as const }));
    previewing = track;
    previewer.play(notes, song.measures, $settings.volume, () => (previewing = null));
  }

  function trackRange(track: number): { low: number; high: number } {
    let low = 127;
    let high = 0;
    for (const n of song?.notes ?? []) {
      if (n.track !== track) continue;
      low = Math.min(low, n.pitch);
      high = Math.max(high, n.pitch);
    }
    return { low, high };
  }

  function openSettings() {
    screen.update((current) => ({ name: 'settings', back: current }));
  }

  function start() {
    if (!handHasNotes) return;
    previewer.stop();
    const speed = speedPercent / 100;
    settings.update((s) => ({ ...s, lastHand: hand, lastMode: mode, lastSpeed: speed }));
    screen.set({ name: 'play', request: { songId, hand, mode, speed } });
  }

  /** Watches the whole song play on the falling-notes screen; the hand choice is kept for practice. */
  function listen() {
    if (playable.length === 0) return;
    previewer.stop();
    const speed = speedPercent / 100;
    settings.update((s) => ({ ...s, lastHand: hand, lastMode: mode, lastSpeed: speed }));
    screen.set({ name: 'play', request: { songId, hand: 'none', mode, speed } });
  }
</script>

<main class="screen">
  <header class="screen-header">
    <button class="ghost" onclick={() => screen.set({ name: 'library' })} aria-label={$t('common.back')}>←</button>
    <h1>{song?.title ?? ''}</h1>
    <ConnectionBadge />
    <button class="ghost gear" onclick={openSettings} aria-label={$t('settings.title')} title={$t('settings.title')}
      >⚙</button
    >
  </header>

  {#if failed}
    <p class="error">{$t('error.songMissing')}</p>
  {:else if song && handConfig}
    <div class="layout">
      <section class="card">
        <h2>{$t('setup.tracks')}</h2>
        {#if song.tracks.length > 1}
          <label class="check">
            <input
              type="checkbox"
              checked={handConfig.method === 'split'}
              onchange={(e) => setSplit(e.currentTarget.checked)}
            />
            {$t('setup.splitByPitch')}
          </label>
        {/if}

        {#if handConfig.method === 'split'}
          <label class="field">
            <span>{$t('setup.splitPoint', { note: $nameNote(draftSplit ?? handConfig.splitPitch) })}</span>
            <input
              type="range"
              min="36"
              max="84"
              value={handConfig.splitPitch}
              oninput={(e) => (draftSplit = Number(e.currentTarget.value))}
              onchange={(e) => {
                draftSplit = null;
                void updateConfig({ ...handConfig!, splitPitch: Number(e.currentTarget.value) });
              }}
            />
          </label>
        {:else}
          <ul class="tracks">
            {#each song.tracks as track (track.index)}
              <li>
                <div class="track-name">
                  <strong>{track.name || $t('setup.track', { n: track.index + 1 })}</strong>
                  <span class="dim">
                    {$t('setup.trackInfo', {
                      count: track.noteCount,
                      low: $nameNote(trackRange(track.index).low),
                      high: $nameNote(trackRange(track.index).high),
                    })}
                  </span>
                </div>
                <select
                  value={handConfig.trackRoles[track.index] ?? 'accompaniment'}
                  onchange={(e) => setTrackRole(track.index, e.currentTarget.value as Role)}
                >
                  {#each ROLES as role (role)}
                    <option value={role}>{$t(ROLE_KEYS[role])}</option>
                  {/each}
                </select>
                <button onclick={() => togglePreview(track.index)}>
                  {previewing === track.index ? '■' : '▶'}
                  <span class="sr">{$t('setup.preview')}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="card options">
        <div class="field">
          <span>{$t('setup.hand')}</span>
          <Segmented
            label={$t('setup.hand')}
            options={HANDS.map((h) => ({ value: h, label: $t(HAND_KEYS[h]) }))}
            value={hand}
            onchange={(v) => (hand = v)}
          />
        </div>
        <div class="field">
          <span>{$t('setup.mode')}</span>
          <Segmented
            label={$t('setup.mode')}
            options={MODES.map((m) => ({ value: m, label: $t(MODE_KEYS[m]) }))}
            value={mode}
            onchange={(v) => (mode = v)}
          />
          <small class="dim">{$t(mode === 'wait' ? 'mode.waitHint' : 'mode.tempoHint')}</small>
        </div>
        <label class="field">
          <span>{$t('setup.speed')}: {speedPercent}%</span>
          <input type="range" min="25" max="150" step="5" bind:value={speedPercent} />
        </label>
        <SoundOutputField />
        <label class="check">
          <input type="checkbox" bind:checked={$settings.soundOn} />
          {$t('setup.sound')}
        </label>
        <label class="field">
          <span>{$t('setup.volume')}: {Math.round($settings.volume * 100)}%</span>
          <input type="range" min="0" max="1" step="0.05" bind:value={$settings.volume} />
        </label>
        {#if !handHasNotes}
          <p class="error">{$t('setup.noNotesForHand')}</p>
        {/if}
        <div class="buttons">
          <button onclick={listen} disabled={playable.length === 0}>{$t('setup.listen')}</button>
          <button class="primary" onclick={start} disabled={!handHasNotes}>{$t('setup.start')} ▶</button>
        </div>
      </section>
    </div>
  {/if}
</main>

<style>
  .layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    align-items: start;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }
  .tracks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .tracks li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .track-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .options {
    display: grid;
    gap: 18px;
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
  .buttons {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
