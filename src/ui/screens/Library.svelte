<script lang="ts">
  import { onMount } from 'svelte';
  import { buildDemoMidi, DEMO_FILE_NAME } from '../../song/demo';
  import { parseSong, SongParseError } from '../../song/parse';
  import type { ScoreRecord, StoredSong } from '../../storage/db';
  import { getScores } from '../../storage/scores';
  import { addSong, deleteSong, listSongs, renameSong } from '../../storage/songs';
  import { getDb, screen, t } from '../app-state';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import { formatDuration } from '../format';
  import { HAND_SHORT_KEYS, MODE_KEYS } from '../labels';

  let songs = $state<StoredSong[]>([]);
  let scores = $state<Record<string, ScoreRecord[]>>({});
  let errors = $state<string[]>([]);
  let loaded = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let deletingId = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement>();

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
    deletingId = null;
    renamingId = song.id;
    renameValue = song.title;
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

  function bestScores(id: string): ScoreRecord[] {
    return [...(scores[id] ?? [])].sort((a, b) => b.best.percent - a.best.percent).slice(0, 3);
  }
</script>

<main class="screen">
  <header class="screen-header">
    <h1>{$t('app.title')}</h1>
    <ConnectionBadge />
  </header>

  <div class="actions">
    <button class="primary" onclick={() => fileInput?.click()}>＋ {$t('library.add')}</button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".mid,.midi,audio/midi,audio/x-midi"
      multiple
      hidden
      onchange={onFiles}
    />
  </div>

  {#each errors as error (error)}
    <p class="error">{error}</p>
  {/each}

  {#if loaded && songs.length === 0}
    <div class="card empty">
      <p>{$t('library.empty')}</p>
      <button onclick={addDemo}>{$t('library.demo')}</button>
    </div>
  {/if}

  <ul class="songs">
    {#each songs as song (song.id)}
      <li class="card">
        {#if renamingId === song.id}
          <form
            class="row"
            onsubmit={(e) => {
              e.preventDefault();
              void confirmRename();
            }}
          >
            <!-- svelte-ignore a11y_autofocus -->
            <input type="text" bind:value={renameValue} autofocus />
            <button class="primary" type="submit">{$t('common.save')}</button>
            <button type="button" onclick={() => (renamingId = null)}>{$t('common.cancel')}</button>
          </form>
        {:else if deletingId === song.id}
          <div class="row">
            <span class="grow">{$t('library.deleteConfirm', { title: song.title })}</span>
            <button class="danger" onclick={() => confirmDelete(song.id)}>{$t('common.delete')}</button>
            <button onclick={() => (deletingId = null)}>{$t('common.cancel')}</button>
          </div>
        {:else}
          <div class="row">
            <button class="open ghost grow" onclick={() => screen.set({ name: 'setup', songId: song.id })}>
              <span class="title">{song.title}</span>
              <span class="meta dim">{formatDuration(song.duration)}</span>
              {#each bestScores(song.id) as record (record.key)}
                <span class="chip">
                  {$t(HAND_SHORT_KEYS[record.hand])} · {$t(MODE_KEYS[record.mode])}
                  {record.best.percent}%
                </span>
              {/each}
            </button>
            <button class="ghost" onclick={() => startRename(song)} aria-label={$t('common.rename')}>✎</button>
            <button
              class="ghost"
              onclick={() => {
                renamingId = null;
                deletingId = song.id;
              }}
              aria-label={$t('common.delete')}>🗑</button
            >
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</main>

<style>
  .actions {
    margin-bottom: 16px;
  }
  .empty {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    justify-content: space-between;
  }
  .empty p {
    margin: 0;
  }
  .songs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .songs li {
    padding: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row input {
    flex: 1;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .open {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    border: none;
    text-align: left;
    padding: 8px 12px;
  }
  .title {
    font-weight: 600;
    font-size: 1.1rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip {
    font-size: 0.8rem;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
</style>
