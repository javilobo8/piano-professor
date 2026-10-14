<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Music from '@lucide/svelte/icons/music';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Piano from '@lucide/svelte/icons/piano';
  import Play from '@lucide/svelte/icons/play';
  import Plus from '@lucide/svelte/icons/plus';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Trash from '@lucide/svelte/icons/trash';
  import X from '@lucide/svelte/icons/x';
  import { onMount } from 'svelte';
  import { buildDemoMidi, DEMO_FILE_NAME } from '../../song/demo';
  import { parseSong, SongParseError } from '../../song/parse';
  import type { ScoreRecord, StoredSong } from '../../storage/db';
  import { getScores } from '../../storage/scores';
  import { addSong, deleteSong, listSongs, renameSong } from '../../storage/songs';
  import { getDb, screen, settings, t } from '../app-state';
  import AppHeader from '../components/AppHeader.svelte';
  import { formatDuration } from '../format';
  import { HAND_KEYS, MODE_KEYS } from '../labels';
  import { latestPractice } from '../latest-practice';

  let songs = $state<StoredSong[]>([]);
  let scores = $state<Record<string, ScoreRecord[]>>({});
  let errors = $state<string[]>([]);
  let loaded = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let deletingId = $state<string | null>(null);
  /** Song whose "more" menu is open. */
  let menuId = $state<string | null>(null);
  /** True between a pointerdown that closed a menu and its click, so dismissing doesn't open a song. */
  let dismissing = false;
  let fileInput = $state<HTMLInputElement>();

  /** Most recent practice, for the "keep practising" card (only while its song is in the library). */
  const latest = $derived(latestPractice(Object.values(scores).flat()));
  const latestSong = $derived(latest ? songs.find((s) => s.id === latest.songId) : undefined);

  async function refresh() {
    const db = await getDb();
    songs = await listSongs(db);
    const entries = await Promise.all(songs.map(async (s) => [s.id, await getScores(db, s.id)] as const));
    scores = Object.fromEntries(entries);
    loaded = true;
  }

  onMount(() => {
    void refresh();
  });

  /** Adds one file; returns an error message or null. */
  async function importFile(name: string, bytes: ArrayBuffer): Promise<string | null> {
    try {
      const song = parseSong(bytes, name);
      await addSong(await getDb(), { title: song.title, fileName: name, bytes, duration: song.duration });
      void navigator.storage?.persist?.();
      return null;
    } catch (e) {
      if (e instanceof SongParseError && e.code === 'empty') return $t('error.emptySong', { name });
      return $t('error.invalidMidi', { name });
    }
  }

  async function onFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    const results = await Promise.all(files.map(async (f) => importFile(f.name, await f.arrayBuffer())));
    errors = results.filter((r): r is string => r !== null);
    await refresh();
  }

  async function addDemo() {
    const result = await importFile(DEMO_FILE_NAME, new Uint8Array(buildDemoMidi()).buffer);
    errors = result ? [result] : [];
    await refresh();
  }

  function startRename(song: StoredSong) {
    menuId = null;
    deletingId = null;
    renamingId = song.id;
    renameValue = song.title;
  }

  function startDelete(song: StoredSong) {
    menuId = null;
    renamingId = null;
    deletingId = song.id;
  }

  async function confirmRename() {
    if (renamingId) await renameSong(await getDb(), renamingId, renameValue);
    renamingId = null;
    await refresh();
  }

  async function confirmDelete(id: string) {
    await deleteSong(await getDb(), id);
    deletingId = null;
    await refresh();
  }

  function openSetup(songId: string) {
    screen.set({ name: 'setup', songId });
  }

  function openFreePlay() {
    screen.set({ name: 'freePlay' });
  }

  function continuePractice() {
    if (!latest) return;
    const { songId, hand, mode } = latest;
    // Remember what is played, like Setup's start, so Back to Setup shows the same hand and mode.
    settings.update((s) => ({ ...s, lastHand: hand, lastMode: mode }));
    screen.set({ name: 'play', request: { songId, hand, mode, speed: $settings.lastSpeed } });
  }

  /** A click anywhere on a card opens setup, except on its own buttons and menu. */
  function onCardClick(event: MouseEvent, songId: string) {
    if (dismissing || (event.target as Element).closest('button, [data-song-menu]')) return;
    openSetup(songId);
  }

  function toggleMenu(songId: string) {
    menuId = menuId === songId ? null : songId;
  }

  function closeMenuOutside(event: PointerEvent) {
    dismissing = menuId !== null && !(event.target as Element).closest('[data-song-menu]');
    if (dismissing) menuId = null;
  }

  function closeMenuOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !menuId) return;
    const toggle = document.getElementById(`more-${menuId}`);
    menuId = null;
    toggle?.focus();
  }

  /**
   * Closes the menu when keyboard focus moves to something outside it (and its toggle).
   * A null target (focus to nothing, e.g. Safari taps) is left to the pointerdown handler.
   */
  function closeMenuOnFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && !(event.currentTarget as Element).contains(next)) menuId = null;
  }

  /** Moves focus into a menu when it opens. */
  function focusFirstItem(node: HTMLElement) {
    node.querySelector('button')?.focus();
  }

  function bestScores(id: string): ScoreRecord[] {
    return [...(scores[id] ?? [])].sort((a, b) => b.best.percent - a.best.percent).slice(0, 3);
  }

  function clampPercent(percent: number): number {
    return Math.min(100, Math.max(0, percent));
  }
</script>

<svelte:window onpointerdown={closeMenuOutside} onclick={() => (dismissing = false)} onkeydown={closeMenuOnEscape} />

<main class="screen">
  <AppHeader />

  <input
    bind:this={fileInput}
    type="file"
    accept=".mid,.midi,audio/midi,audio/x-midi"
    multiple
    hidden
    onchange={onFiles}
  />

  {#if loaded && songs.length === 0}
    <section class="featured welcome-card">
      <span class="tile"><Music size={20} aria-hidden="true" /></span>
      <div class="featured-text">
        <p class="welcome">{$t('library.welcome')}</p>
      </div>
      <div class="featured-actions">
        <button class="primary" onclick={() => fileInput?.click()}
          ><Plus size={20} aria-hidden="true" />{$t('library.add')}</button
        >
        <button onclick={addDemo}><Sparkles size={20} aria-hidden="true" />{$t('library.demo')}</button>
        <button onclick={openFreePlay}><Piano size={20} aria-hidden="true" />{$t('freePlay.open')}</button>
      </div>
    </section>
  {:else if loaded}
    {#if latest && latestSong}
      <section class="featured">
        <span class="tile"><Music size={20} aria-hidden="true" /></span>
        <div class="featured-text">
          <h2 class="label">{$t('library.continueTitle')}</h2>
          <p class="featured-title" title={latestSong.title}>{latestSong.title}</p>
          <p class="featured-meta dim">
            {$t(HAND_KEYS[latest.hand])} · {$t(MODE_KEYS[latest.mode])} ·
            {$t('library.best', { percent: latest.best.percent })}
          </p>
        </div>
        <div class="featured-actions">
          <button class="primary" onclick={continuePractice}
            ><Play size={20} aria-hidden="true" />{$t('library.continue')}</button
          >
        </div>
      </section>
    {/if}

    <div class="toolbar">
      <div class="toolbar-title">
        <h2>{$t('library.title')}</h2>
        <span class="count dim"
          >{songs.length === 1 ? $t('library.countOne') : $t('library.count', { n: songs.length })}</span
        >
      </div>
      <div class="toolbar-actions">
        <button onclick={openFreePlay}><Piano size={20} aria-hidden="true" />{$t('freePlay.open')}</button>
        <button class="primary" onclick={() => fileInput?.click()}
          ><Plus size={20} aria-hidden="true" />{$t('library.add')}</button
        >
      </div>
    </div>
  {/if}

  {#if errors.length > 0}
    <div class="errors" role="alert">
      <CircleAlert size={20} aria-hidden="true" />
      <ul>
        {#each errors as error, i (i)}
          <li>{error}</li>
        {/each}
      </ul>
      <button class="icon ghost" onclick={() => (errors = [])} aria-label={$t('common.close')} title={$t('common.close')}>
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  {/if}

  {#if songs.length > 0}
    <ul class="songs">
      {#each songs as song (song.id)}
        <li class="song card" class:raised={menuId === song.id}>
          {#if renamingId === song.id}
            <form
              class="inline-edit"
              onsubmit={(e) => {
                e.preventDefault();
                void confirmRename();
              }}
            >
              <!-- svelte-ignore a11y_autofocus -->
              <input type="text" bind:value={renameValue} aria-label={$t('common.rename')} autofocus />
              <div class="inline-actions">
                <button class="primary" type="submit">{$t('common.save')}</button>
                <button type="button" onclick={() => (renamingId = null)}>{$t('common.cancel')}</button>
              </div>
            </form>
          {:else if deletingId === song.id}
            <div class="inline-edit">
              <p class="confirm">{$t('library.deleteConfirm', { title: song.title })}</p>
              <div class="inline-actions">
                <button class="danger" onclick={() => confirmDelete(song.id)}>{$t('common.delete')}</button>
                <button onclick={() => (deletingId = null)}>{$t('common.cancel')}</button>
              </div>
            </div>
          {:else}
            {@const best = bestScores(song.id)}
            <!-- The play button is the keyboard path; the card click is only a larger touch target. -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="song-body" onclick={(e) => onCardClick(e, song.id)}>
              <div class="song-head">
                <h3 class="song-title" title={song.title}>{song.title}</h3>
                <div class="more" data-song-menu onfocusout={closeMenuOnFocusOut}>
                  <button
                    id="more-{song.id}"
                    class="icon ghost"
                    onclick={() => toggleMenu(song.id)}
                    aria-label={$t('common.more')}
                    title={$t('common.more')}
                    aria-expanded={menuId === song.id}
                    aria-controls={menuId === song.id ? `menu-${song.id}` : undefined}
                  >
                    <Ellipsis size={20} aria-hidden="true" />
                  </button>
                  {#if menuId === song.id}
                    <div id="menu-{song.id}" class="menu" {@attach focusFirstItem}>
                      <button class="ghost" onclick={() => startRename(song)}
                        ><Pencil size={18} aria-hidden="true" />{$t('common.rename')}</button
                      >
                      <button class="ghost menu-danger" onclick={() => startDelete(song)}
                        ><Trash size={18} aria-hidden="true" />{$t('common.delete')}</button
                      >
                    </div>
                  {/if}
                </div>
              </div>

              {#if best.length > 0}
                <ul class="results">
                  {#each best as record (record.key)}
                    <li>
                      <span class="result-label">{$t(HAND_KEYS[record.hand])} · {$t(MODE_KEYS[record.mode])}</span>
                      <span class="result-percent">{record.best.percent}%</span>
                      <span class="bar" aria-hidden="true"
                        ><span style:width="{clampPercent(record.best.percent)}%"></span></span
                      >
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="no-scores">{$t('library.noScores')}</p>
              {/if}

              <div class="song-foot">
                <span class="duration dim">{formatDuration(song.duration)}</span>
                <button
                  class="icon primary play"
                  onclick={() => openSetup(song.id)}
                  aria-label={$t('library.open', { title: song.title })}
                  title={$t('library.open', { title: song.title })}
                >
                  <Play size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  /* ---------- Keep practising / welcome ---------- */

  .featured {
    container-type: inline-size;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px 20px;
    margin-top: 8px;
    padding: 20px 24px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: linear-gradient(120deg, rgba(124, 92, 255, 0.28), rgba(34, 211, 238, 0.16));
  }
  .tile {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: var(--radius);
    background: var(--accent-gradient);
    color: #fff;
    box-shadow: var(--shadow-glow);
  }
  .featured-text {
    min-width: 0;
  }
  .featured-text .label {
    margin: 0 0 4px;
  }
  .featured-title {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.25;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .featured-meta {
    margin: 4px 0 0;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .welcome {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.35;
  }
  .featured-actions {
    display: flex;
    gap: 8px;
  }
  .featured-actions button {
    white-space: nowrap;
  }

  /* The welcome card's three buttons always sit on their own row under the text. */
  .welcome-card .featured-actions {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }

  /* Narrow card: the buttons take a full-width row under the text, sharing it and wrapping if needed. */
  @container (max-width: 520px) {
    .featured-actions {
      grid-column: 1 / -1;
      flex-wrap: wrap;
    }
    .featured-actions button {
      flex: 1 1 auto;
      padding: 0 16px;
      white-space: normal;
    }
  }

  /* ---------- Toolbar ---------- */

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 16px;
    margin: 8px 0 16px;
  }
  .featured + .toolbar {
    margin-top: 32px;
  }
  .toolbar-title {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }
  .toolbar h2 {
    margin: 0;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .count {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  /* ---------- Import errors ---------- */

  .errors {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
    padding: 8px 8px 8px 16px;
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    background: rgba(248, 113, 113, 0.08);
    color: var(--danger);
  }
  .featured + .errors {
    margin-top: 16px;
  }
  .errors > :global(svg) {
    flex: none;
    margin-top: 12px;
  }
  .errors ul {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 12px 0;
    list-style: none;
    display: grid;
    gap: 4px;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .errors button {
    color: var(--danger);
  }

  /* ---------- Song grid ---------- */

  .songs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .song {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 0;
    transition: border-color 0.15s ease;
  }
  /* Keeps an open menu above the cards that follow. */
  .song.raised {
    z-index: 2;
  }
  .song-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 12px 12px 16px;
    cursor: pointer;
  }
  .song-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .song-title {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding-top: 12px;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.35;
    letter-spacing: -0.005em;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .more {
    position: relative;
    flex: none;
    margin: 0 -4px 0 0;
  }
  .more > button {
    color: var(--text-dim);
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 3;
    display: grid;
    min-width: 176px;
    padding: 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface-solid);
    box-shadow: var(--shadow-pop);
  }
  .menu button {
    justify-content: flex-start;
    min-height: var(--tap-sm);
    padding: 0 12px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    white-space: nowrap;
  }
  .menu .menu-danger {
    color: var(--danger);
  }

  .results {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .results li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 6px 12px;
    font-size: 13px;
  }
  .result-label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-dim);
  }
  .result-percent {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    grid-column: 1 / -1;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent-gradient);
  }
  .no-scores {
    margin: 0;
    color: var(--text-faint);
    font-size: 13px;
  }

  .song-foot {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .duration {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .play {
    border-radius: 50%;
  }
  /* Optical centring of the play triangle. */
  .play > :global(svg) {
    margin-left: 1px;
  }

  .inline-edit {
    display: grid;
    gap: 12px;
    padding: 16px;
  }
  .inline-edit input {
    width: 100%;
  }
  .confirm {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .inline-actions {
    display: flex;
    gap: 8px;
  }
  .inline-actions button {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 12px;
  }

  @media (hover: hover) {
    .song:hover {
      border-color: var(--border-strong);
    }
    .more > button:hover {
      color: var(--text);
    }
  }

  /* ---------- Phone ---------- */

  @media (max-width: 599px) {
    .featured {
      padding: 16px;
    }
    .tile {
      width: 44px;
      height: 44px;
    }
    .featured + .toolbar {
      margin-top: 24px;
    }
    .toolbar h2 {
      font-size: 24px;
    }
    .toolbar-actions {
      flex: 1 1 100%;
      flex-wrap: wrap;
    }
    .toolbar-actions button {
      flex: 1 1 auto;
      padding: 0 16px;
    }
  }
</style>
