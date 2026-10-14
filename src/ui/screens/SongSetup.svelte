<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Hand from '@lucide/svelte/icons/hand';
  import Headphones from '@lucide/svelte/icons/headphones';
  import Music from '@lucide/svelte/icons/music';
  import Play from '@lucide/svelte/icons/play';
  import Square from '@lucide/svelte/icons/square';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import { onDestroy, onMount } from 'svelte';
  import { practicedRoles } from '../../engine/session';
  import type { Mode } from '../../engine/types';
  import { applyHandConfig, autoHandConfig } from '../../song/hands';
  import type { HandConfig, Role, Song } from '../../song/types';
  import type { HandChoice } from '../../storage/settings';
  import { saveHandConfig } from '../../storage/songs';
  import { getDb, nameNote, output, screen, settings, t } from '../app-state';
  import AppHeader from '../components/AppHeader.svelte';
  import Segmented from '../components/Segmented.svelte';
  import SoundOutputField from '../components/SoundOutputField.svelte';
  import { HAND_KEYS, MODE_KEYS, ROLE_KEYS } from '../labels';
  import { Previewer } from '../previewer';
  import { loadSong } from '../song-loader';

  let { songId }: { songId: string } = $props();

  const ROLES: Role[] = ['right', 'left', 'accompaniment', 'ignore'];
  const HANDS: HandChoice[] = ['right', 'left', 'both'];
  const MODES: Mode[] = ['wait', 'tempo'];
  const SPEED_MIN = 25;
  const SPEED_MAX = 150;
  const SPLIT_MIN = 36;
  const SPLIT_MAX = 84;

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

  /** Position of `value` within [min, max] as a CSS percentage, for the range's gradient fill. */
  function fill(value: number, min: number, max: number): string {
    return `${((value - min) / (max - min)) * 100}%`;
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


<main class="screen" class:with-bar={!!(song && handConfig)}>
  <AppHeader title={song?.title ?? ''} onback={() => screen.set({ name: 'library' })} />

  {#if failed}
    <p class="notice" role="alert"><CircleAlert size={20} aria-hidden="true" />{$t('error.songMissing')}</p>
  {:else if song && handConfig}
    {@const splitNote = $nameNote(draftSplit ?? handConfig.splitPitch)}
    <div class="layout">
      <section class="card practice" aria-labelledby="practice-title">
        <div class="card-head">
          <span class="card-icon"><Hand size={18} aria-hidden="true" /></span>
          <h2 id="practice-title">{$t('setup.practice')}</h2>
        </div>

        <div class="field">
          <span class="label">{$t('setup.hand')}</span>
          <Segmented
            full
            label={$t('setup.hand')}
            options={HANDS.map((h) => ({ value: h, label: $t(HAND_KEYS[h]) }))}
            value={hand}
            onchange={(v) => (hand = v)}
          />
        </div>

        <div class="field">
          <span class="label">{$t('setup.mode')}</span>
          <Segmented
            full
            label={$t('setup.mode')}
            options={MODES.map((m) => ({ value: m, label: $t(MODE_KEYS[m]) }))}
            value={mode}
            onchange={(v) => (mode = v)}
          />
          <p class="hint">{$t(mode === 'wait' ? 'mode.waitHint' : 'mode.tempoHint')}</p>
        </div>

        <div class="field">
          <div class="field-head">
            <label class="label" for="speed">{$t('setup.speed')}</label>
            <span class="pill value">{speedPercent}%</span>
          </div>
          <input
            id="speed"
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step="5"
            bind:value={speedPercent}
            aria-valuetext="{speedPercent}%"
            style:--fill={fill(speedPercent, SPEED_MIN, SPEED_MAX)}
          />
        </div>

        <div class="subsection">
          <h3 class="label subhead"><Volume2 size={16} aria-hidden="true" />{$t('settings.sound')}</h3>
          <SoundOutputField />
          <label class="switch-row">
            <span>{$t('setup.sound')}</span>
            <input type="checkbox" class="switch" role="switch" bind:checked={$settings.soundOn} />
          </label>
          <div class="field">
            <div class="field-head">
              <label class="label" for="volume">{$t('setup.volume')}</label>
              <span class="pill value">{Math.round($settings.volume * 100)}%</span>
            </div>
            <input
              id="volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              bind:value={$settings.volume}
              aria-valuetext="{Math.round($settings.volume * 100)}%"
              style:--fill={fill($settings.volume, 0, 1)}
            />
          </div>
        </div>

        {#if !handHasNotes}
          <p class="notice" role="alert"><CircleAlert size={20} aria-hidden="true" />{$t('setup.noNotesForHand')}</p>
        {/if}

        <div class="actions">
          <button
            onclick={listen}
            disabled={playable.length === 0}
            aria-label={$t('setup.listen')}
            title={$t('setup.listen')}
            ><Headphones size={20} aria-hidden="true" /><span class="long">{$t('setup.listen')}</span><span
              class="short">{$t('setup.listenShort')}</span
            ></button
          >
          <button class="primary" onclick={start} disabled={!handHasNotes}
            ><Play size={20} aria-hidden="true" /><span>{$t('setup.start')}</span></button
          >
        </div>
      </section>

      <section class="card tracks-card" aria-labelledby="tracks-title">
        <div class="card-head">
          <span class="card-icon"><Music size={18} aria-hidden="true" /></span>
          <h2 id="tracks-title">{$t('setup.tracks')}</h2>
        </div>

        {#if song.tracks.length > 1}
          <label class="switch-row">
            <span>{$t('setup.splitByPitch')}</span>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              checked={handConfig.method === 'split'}
              onchange={(e) => setSplit(e.currentTarget.checked)}
            />
          </label>
        {/if}

        {#if handConfig.method === 'split'}
          <div class="field">
            <div class="field-head">
              <label class="label" for="split-point">{$t('setup.splitLabel')}</label>
              <span class="pill value">{splitNote}</span>
            </div>
            <input
              id="split-point"
              type="range"
              min={SPLIT_MIN}
              max={SPLIT_MAX}
              value={handConfig.splitPitch}
              aria-valuetext={splitNote}
              aria-describedby="split-hint"
              style:--fill={fill(draftSplit ?? handConfig.splitPitch, SPLIT_MIN, SPLIT_MAX)}
              oninput={(e) => (draftSplit = Number(e.currentTarget.value))}
              onchange={(e) => {
                draftSplit = null;
                void updateConfig({ ...handConfig!, splitPitch: Number(e.currentTarget.value) });
              }}
            />
            <p class="hint" id="split-hint">{$t('setup.splitPoint', { note: splitNote })}</p>
          </div>
        {:else}
          <ul class="tracks">
            {#each song.tracks as track (track.index)}
              {@const role = handConfig.trackRoles[track.index] ?? 'accompaniment'}
              {@const name = track.name || $t('setup.track', { n: track.index + 1 })}
              <li class="track" class:ignored={role === 'ignore'}>
                <div class="track-name">
                  <span class="role-dot {role}" aria-hidden="true"></span>
                  <div class="track-text">
                    <strong id="track-{track.index}" title={name}>{name}</strong>
                    <span class="track-info">
                      {$t('setup.trackInfo', {
                        count: track.noteCount,
                        low: $nameNote(trackRange(track.index).low),
                        high: $nameNote(trackRange(track.index).high),
                      })}
                    </span>
                  </div>
                </div>
                <select
                  value={role}
                  aria-labelledby="track-{track.index}"
                  onchange={(e) => setTrackRole(track.index, e.currentTarget.value as Role)}
                >
                  {#each ROLES as r (r)}
                    <option value={r}>{$t(ROLE_KEYS[r])}</option>
                  {/each}
                </select>
                <button
                  class="icon preview"
                  class:playing={previewing === track.index}
                  onclick={() => togglePreview(track.index)}
                  aria-label={$t('setup.preview')}
                  title={$t('setup.preview')}
                  aria-describedby="track-{track.index}"
                  aria-pressed={previewing === track.index}
                >
                  {#if previewing === track.index}
                    <Square size={16} fill="currentColor" aria-hidden="true" />
                  {:else}
                    <Play size={18} aria-hidden="true" />
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</main>

<style>
  /* ---------- Layout: one column (Practice first), two columns (Tracks | Practice) when wide ---------- */

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    margin-top: 8px;
  }
  .card {
    display: grid;
    align-content: start;
    gap: 20px;
    min-width: 0;
  }

  /* ---------- Fields ---------- */

  .field {
    display: grid;
    gap: 8px;
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

  /* Whole row is the toggle's touch target. */
  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: var(--tap);
    cursor: pointer;
  }
  .switch-row > span {
    min-width: 0;
    font-weight: 600;
  }

  .subsection {
    display: grid;
    gap: 16px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }
  .subhead {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--text);
  }
  .subhead > :global(svg) {
    color: var(--cyan);
  }

  main > .notice {
    margin-top: 8px;
  }

  /*
   * ---------- Actions ----------
   * Tall screens from 600 px: a glass footer stuck to the bottom of the Practice card, so Start stays in
   * view while the card is longer than the screen. Phones and short screens: a fixed glass bar (below).
   */

  .actions {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin: 4px -20px -20px;
    padding: 16px 20px max(20px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    border-radius: 0 0 calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px);
    background: var(--glass);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
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
  .actions .short {
    display: none;
  }
  .actions .primary {
    min-width: 160px;
  }
  /* Optical centring of the play triangle next to its label. */
  .actions .primary > :global(svg) {
    margin-left: -2px;
  }

  /* ---------- Tracks ---------- */

  .tracks {
    display: grid;
    margin: -8px 0;
    padding: 0;
    list-style: none;
  }
  .track {
    display: grid;
    /* The role column never takes more than half the row; a long role label ellipsises. */
    grid-template-columns: minmax(0, 1fr) fit-content(50%) auto;
    grid-template-areas: 'name role preview';
    align-items: center;
    gap: 8px 12px;
    padding: 12px 0;
  }
  .track + .track {
    border-top: 1px solid var(--border);
  }
  .track-name {
    grid-area: name;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .track-text {
    display: grid;
    min-width: 0;
  }
  .track-text strong,
  .track-info {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .track-text strong {
    font-weight: 700;
  }
  .track-info {
    color: var(--text-dim);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .track.ignored .track-text {
    opacity: 0.5;
  }

  /* Colour of the role the track plays. */
  .role-dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-dim);
  }
  .role-dot.right {
    background: var(--right);
    box-shadow: 0 0 8px rgba(34, 211, 238, 0.6);
  }
  .role-dot.left {
    background: var(--left);
    box-shadow: 0 0 8px rgba(167, 139, 250, 0.6);
  }
  .role-dot.ignore {
    background: transparent;
    border: 1.5px solid var(--text-faint);
  }

  .track select {
    grid-area: role;
    width: 100%;
    min-width: 0;
    min-height: var(--tap-sm);
  }
  .preview {
    grid-area: preview;
    border-radius: 50%;
  }
  .preview > :global(svg) {
    margin-left: 1px;
  }
  .preview.playing {
    background: var(--accent-gradient);
    background-origin: border-box;
    border-color: transparent;
    color: #fff;
    box-shadow: var(--shadow-glow);
  }
  .preview.playing > :global(svg) {
    margin-left: 0;
  }

  /* ---------- Tablet and up ---------- */

  @media (min-width: 600px) {
    .layout {
      gap: 20px;
    }
  }

  @media (min-width: 1024px) {
    .layout {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: 'tracks practice';
      align-items: start;
      gap: 24px;
    }
    .practice {
      grid-area: practice;
    }
    .tracks-card {
      grid-area: tracks;
    }
  }

  /* ---------- Phone ---------- */

  @media (max-width: 599px) {
    .layout {
      gap: 12px;
    }
    .card {
      gap: 16px;
    }
  }

  /* Phones and short (landscape) screens: the actions float in a fixed glass bar at the bottom. */
  @media (max-width: 599px), (max-height: 500px) {
    /* Room for the bar: border + 12 px + button + bottom inset, plus 24 px of air. */
    .screen.with-bar {
      padding-bottom: calc(var(--tap) + 37px + max(12px, env(safe-area-inset-bottom)));
    }
    .actions {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 10;
      margin: 0;
      padding: 12px max(24px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom))
        max(24px, env(safe-area-inset-left));
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      box-shadow: var(--shadow-pop);
    }
  }

  /* Phones: two equal buttons, with the short "Listen" label. */
  @media (max-width: 599px) {
    .actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      padding-right: max(16px, env(safe-area-inset-right));
      padding-left: max(16px, env(safe-area-inset-left));
    }
    .actions button {
      padding: 0 12px;
    }
    .actions .primary {
      min-width: 0;
    }
    .actions .long {
      display: none;
    }
    .actions .short {
      display: inline;
    }
  }

  /* Narrow: the role select drops under the track name. */
  @media (max-width: 479px) {
    .track {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'name preview'
        'role role';
    }
  }
</style>
