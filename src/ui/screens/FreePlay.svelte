<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { connection, nameNote, screen, t } from '../app-state';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import { FreePlayController } from '../free-play-controller';

  let canvas = $state<HTMLCanvasElement>();
  let controller = $state.raw<FreePlayController | null>(null);
  let held = $state<number[]>([]);
  /** The hint goes away for good once anything has been played. */
  let played = $state(false);
  let destroyed = false;
  let wakeLock: WakeLockSentinel | null = null;

  function onHeldChange(next: number[]) {
    held = next;
    if (next.length > 0) played = true;
  }

  async function requestWakeLock() {
    try {
      const sentinel = (await navigator.wakeLock?.request('screen')) ?? null;
      if (destroyed) {
        void sentinel?.release().catch(() => undefined);
        return;
      }
      wakeLock = sentinel;
    } catch {
      wakeLock = null;
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void requestWakeLock();
  }

  onMount(() => {
    if (!canvas) return;
    const created = new FreePlayController(canvas, connection, (p: number) => $nameNote(p, false), onHeldChange);
    created.start();
    controller = created;
    void requestWakeLock();
    document.addEventListener('visibilitychange', onVisibility);
  });

  onDestroy(() => {
    destroyed = true;
    controller?.stop();
    document.removeEventListener('visibilitychange', onVisibility);
    void wakeLock?.release().catch(() => undefined);
  });

  $effect(() => {
    // Track the note-name style and language; `controller` is $state.raw so this also runs once it exists.
    const name = $nameNote;
    controller?.setNoteLabel((p: number) => name(p, false));
  });
</script>

<div class="free">
  <header class="bar">
    <button class="ghost" onclick={() => screen.set({ name: 'library' })} aria-label={$t('common.back')}>←</button>
    <h1>{$t('freePlay.title')}</h1>
    <span class="held">{held.map((p) => $nameNote(p)).join(' · ')}</span>
    <ConnectionBadge compact />
  </header>

  <div class="stage">
    <canvas bind:this={canvas}></canvas>
    {#if !played}
      <p class="hint dim">{$t('freePlay.hint')}</p>
    {/if}
  </div>
</div>

<style>
  .free {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #12141a;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left));
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .bar button {
    min-height: 44px;
    padding: 0 12px;
  }
  h1 {
    margin: 0;
    font-size: 1.1rem;
  }
  .held {
    flex: 1;
    min-width: 0;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 0 16px;
    text-align: center;
    pointer-events: none;
  }
</style>
