<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import { onDestroy, onMount } from 'svelte';
  import { connection, nameNote, output, screen, settings, t } from '../app-state';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import Sheet from '../components/Sheet.svelte';
  import ViewControls from '../components/ViewControls.svelte';
  import { FreePlayController } from '../free-play-controller';
  import { createIdleDimmer } from '../idle-dimmer';
  import { NO_VIEW_STATE, type ViewState } from '../view-state';

  let canvas = $state<HTMLCanvasElement>();
  let controller = $state.raw<FreePlayController | null>(null);
  let held = $state<number[]>([]);
  /** The hint goes away for good once anything has been played. */
  let played = $state(false);
  let view = $state<ViewState>(NO_VIEW_STATE);
  let destroyed = false;
  let wakeLock: WakeLockSentinel | null = null;
  /** The View sheet; the piano (MIDI and PC keyboard) keeps playing while it is open. */
  let sheetOpen = $state(false);
  /** Controls fade after a while without touching the screen, leaving a clean view to play. */
  let dimmed = $state(false);
  const dimmer = createIdleDimmer({ delayMs: 3000, onChange: (next) => (dimmed = next) });
  const poke = () => dimmer.poke();
  const POKE_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

  const heldNames = $derived(held.map((p) => $nameNote(p)).join(' · '));

  function onHeldChange(next: number[]) {
    held = next;
  }

  function openSettings() {
    screen.update((current) => ({ name: 'settings', back: current }));
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
    else controller?.releaseAll();
  }

  onMount(() => {
    if (!canvas) return;
    const created = new FreePlayController(
      canvas,
      connection,
      output,
      (p: number) => $nameNote(p, false),
      onHeldChange,
      () => (played = true),
      {
        zoom: $settings.freePlayView,
        onChange: (next) => (view = next),
        onCommit: (zoom) => settings.update((s) => ({ ...s, freePlayView: zoom })),
      },
    );
    created.start();
    controller = created;
    void requestWakeLock();
    document.addEventListener('visibilitychange', onVisibility);
  });

  onMount(() => {
    window.addEventListener('pointerdown', poke, POKE_OPTIONS);
    window.addEventListener('pointermove', poke, POKE_OPTIONS);
    window.addEventListener('keydown', poke, POKE_OPTIONS);
    return () => {
      window.removeEventListener('pointerdown', poke, POKE_OPTIONS);
      window.removeEventListener('pointermove', poke, POKE_OPTIONS);
      window.removeEventListener('keydown', poke, POKE_OPTIONS);
    };
  });

  onDestroy(() => {
    destroyed = true;
    controller?.stop();
    document.removeEventListener('visibilitychange', onVisibility);
    void wakeLock?.release().catch(() => undefined);
    dimmer.dispose();
  });

  $effect(() => {
    // Never dim while the View sheet is open.
    dimmer.setEnabled(controller !== null && !sheetOpen);
  });

  $effect(() => {
    // Track the note-name style and language; `controller` is $state.raw so this also runs once it exists.
    const name = $nameNote;
    controller?.setNoteLabel((p: number) => name(p, false));
  });
</script>

<div class="free">
  <canvas bind:this={canvas}></canvas>
  {#if !played}
    <p class="hint">{$t('freePlay.hint')}</p>
  {/if}

  <div class="controls" class:dimmed>
    <div class="top">
      <div class="glass cluster start">
        <button
          class="icon ghost round"
          onclick={() => screen.set({ name: 'library' })}
          aria-label={$t('common.back')}
          title={$t('common.back')}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <h1 class="title">{$t('freePlay.title')}</h1>
      </div>

      {#if held.length > 0}
        <div class="glass held">
          <span class="notes">{heldNames}</span>
        </div>
      {/if}

      <div class="glass cluster end">
        <span class="conn"><ConnectionBadge compact /></span>
        <button
          class="icon ghost round"
          onclick={openSettings}
          aria-label={$t('settings.title')}
          title={$t('settings.title')}
        >
          <SettingsIcon size={20} aria-hidden="true" />
        </button>
        <button
          class="icon ghost round"
          onclick={() => (sheetOpen = true)}
          aria-haspopup="dialog"
          aria-label={$t('play.view')}
          title={$t('play.view')}
        >
          <Ellipsis size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>

  <Sheet open={sheetOpen} title={$t('play.view')} onclose={() => (sheetOpen = false)}>
    <ViewControls
      {view}
      onzoomkeys={(d) => controller?.zoomKeys(d)}
      onzoomtime={(d) => controller?.zoomTime(d)}
      onfit={() => controller?.fit()}
    />
  </Sheet>
</div>

<style>
  .free {
    position: relative;
    height: 100dvh;
    overflow: hidden;
    isolation: isolate;
    background: #090b16;
  }
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  /* Centred over the falling-notes area, clear of the keyboard at the bottom. */
  .hint {
    position: absolute;
    inset: 0 0 20% 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 0 max(24px, env(safe-area-inset-right)) 0 max(24px, env(safe-area-inset-left));
    color: var(--text-dim);
    font-size: 15px;
    font-weight: 500;
    line-height: 1.5;
    text-align: center;
    text-wrap: balance;
    pointer-events: none;
  }

  /* ---------- Floating controls (same layer as Play) ---------- */

  .controls {
    position: absolute;
    inset: 0;
    z-index: 1;
    padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 0
      max(12px, env(safe-area-inset-left));
    pointer-events: none;
  }
  /*
   * Three columns: the side capsules keep their size and edges, the held-notes pill stays centred
   * in between and gives way (ellipsis) when space runs out.
   */
  .top {
    display: grid;
    grid-template-columns: minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr);
    align-items: center;
    gap: 8px;
  }
  .start {
    grid-column: 1;
    justify-self: start;
  }
  .end {
    grid-column: 3;
    justify-self: end;
  }
  /*
   * Dimming fades each capsule rather than the whole layer: an ancestor with opacity < 1 would
   * stop the capsules' backdrop blur from seeing the canvas. The held notes stay bright.
   */
  .cluster {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    pointer-events: auto;
    transition: opacity 0.4s ease;
  }
  .dimmed .cluster {
    opacity: 0.35;
  }
  .round {
    border-radius: var(--radius-pill);
  }
  .title {
    margin: 0;
    padding: 0 16px 0 4px;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.2;
    white-space: nowrap;
  }

  /* Notes sounding right now: informative only, never catches touches meant for the canvas. */
  .held {
    grid-column: 2;
    justify-self: center;
    display: flex;
    align-items: center;
    min-width: 0;
    max-width: 100%;
    min-height: calc(var(--tap-sm) + 8px);
    padding: 0 20px;
    pointer-events: none;
  }
  .notes {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .conn {
    display: contents;
  }
  /* The badge sits inside a capsule here: no second glass ring. */
  .conn :global(.badge) {
    border-color: transparent;
    background: transparent;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  @media (hover: hover) {
    .conn :global(.badge:hover) {
      border-color: var(--border-strong);
    }
  }

  /* Phones: tighter gutters; the narrowest drop the title to keep room for the notes. */
  @media (max-width: 599px) {
    .controls {
      padding-right: max(8px, env(safe-area-inset-right));
      padding-left: max(8px, env(safe-area-inset-left));
    }
    .top {
      gap: 6px;
    }
    .held {
      padding: 0 14px;
    }
    .notes {
      font-size: 15px;
    }
  }
  /* Too narrow to show: visually hidden, still the page heading for assistive tech. */
  @media (max-width: 399px) {
    .title {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
