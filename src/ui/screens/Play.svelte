<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Crosshair from '@lucide/svelte/icons/crosshair';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Gauge from '@lucide/svelte/icons/gauge';
  import HandIcon from '@lucide/svelte/icons/hand';
  import Headphones from '@lucide/svelte/icons/headphones';
  import PauseIcon from '@lucide/svelte/icons/pause';
  import PlayIcon from '@lucide/svelte/icons/play';
  import { onDestroy, onMount } from 'svelte';
  import { scorePercent } from '../../engine/scoring';
  import { clampSpeed } from '../../engine/session';
  import type { LoopRange, Practice, Score, SessionState, Status } from '../../engine/types';
  import { applyHandConfig } from '../../song/hands';
  import type { Song } from '../../song/types';
  import { recordRun } from '../../storage/scores';
  import { connection, getDb, nameNote, output, screen, settings, t, type PlayRequest } from '../app-state';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import ListenEndOverlay from '../components/ListenEndOverlay.svelte';
  import PlayOptions from '../components/PlayOptions.svelte';
  import ResultsOverlay from '../components/ResultsOverlay.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { formatDuration, measureAt } from '../format';
  import { createIdleDimmer } from '../idle-dimmer';
  import { HAND_SHORT_KEYS } from '../labels';
  import { PlayController, type DisplayOptions } from '../play-controller';
  import { loadSong } from '../song-loader';
  import { NO_VIEW_STATE, type ViewState } from '../view-state';

  let { request }: { request: PlayRequest } = $props();

  let canvas = $state<HTMLCanvasElement>();
  let song = $state<Song | null>(null);
  let failed = $state(false);
  let controller = $state.raw<PlayController | null>(null);
  let destroyed = false;
  /** Incremented whenever a run is restarted or sought, so stale finish() results are ignored. */
  let runId = 0;
  // svelte-ignore state_referenced_locally
  let hand = $state<Practice>(request.hand);
  let songTime = $state(0);
  let status = $state<Status>('playing');
  // svelte-ignore state_referenced_locally
  let speed = $state(request.speed);
  let loop = $state<LoopRange | null>(null);
  let loopPass = $state(0);
  let lastLoopScore = $state.raw<Score | null>(null);
  let results = $state<{ score: Score; saved: boolean; isNewBest: boolean; bestPercent: number | null } | null>(
    null,
  );
  /** True once a listen-only run has played to the end. */
  let listenEnded = $state(false);
  let view = $state<ViewState>(NO_VIEW_STATE);
  let wakeLock: WakeLockSentinel | null = null;
  /** The options sheet; opening it never pauses the song. */
  let sheetOpen = $state(false);
  /** Controls fade after a while without touching the screen, only while the song plays. */
  let dimmed = $state(false);
  const dimmer = createIdleDimmer({ delayMs: 3000, onChange: (next) => (dimmed = next) });
  const poke = () => dimmer.poke();
  const POKE_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

  const measureCount = $derived(song ? song.measures.length - 1 : 0);

  function display(): DisplayOptions {
    return {
      showAccompaniment: $settings.showAccompaniment,
      keyboardRange: $settings.keyboardRange,
      noteLabel: $settings.showNoteLabels ? (p: number) => $nameNote(p, false) : null,
    };
  }

  function onFrame(state: SessionState) {
    songTime = state.songTime;
    speed = state.speed;
    loopPass = state.loopPass;
    lastLoopScore = state.lastLoopScore;
    if (state.status !== status) {
      status = state.status;
      if (status === 'finished' && hand === 'none') listenEnded = true;
      else if (status === 'finished' && state.score) void finish(state.score, state.complete);
    }
  }

  async function finish(score: Score, complete: boolean) {
    const practiced = hand;
    if (practiced === 'none') return;
    const snapshot = { ...score };
    const myRun = runId;
    const percent = scorePercent(snapshot);
    if (!complete) {
      if (myRun !== runId || destroyed) return;
      results = { score: snapshot, saved: false, isNewBest: false, bestPercent: null };
      return;
    }
    const { record, isNewBest } = await recordRun(await getDb(), request.songId, practiced, request.mode, {
      date: Date.now(),
      speed,
      percent,
      score: snapshot,
    });
    if (myRun !== runId || destroyed) return;
    results = { score: snapshot, saved: true, isNewBest, bestPercent: record.best.percent };
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
    else controller?.pause();
  }

  onMount(async () => {
    const loaded = await loadSong(request.songId);
    if (destroyed) return;
    if (!loaded || !canvas) {
      failed = true;
      return;
    }
    song = loaded.song;
    const notes = applyHandConfig(loaded.song, loaded.handConfig);
    const created = new PlayController(
      canvas,
      notes,
      loaded.song.measures,
      {
        mode: request.mode,
        practice: hand,
        speed: request.speed,
        loop: null,
        soundOn: $settings.soundOn,
        volume: $settings.volume,
      },
      connection,
      output,
      display(),
      onFrame,
      {
        zoom: $settings.playView,
        onChange: (next) => (view = next),
        onCommit: (zoom) => settings.update((s) => ({ ...s, playView: zoom })),
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
    // Results and the end of listening are dialogs of their own: never two modal layers at once.
    if (results || listenEnded) sheetOpen = false;
  });

  $effect(() => {
    // Dim only while the song plays freely: never while paused, finished or with the sheet open.
    dimmer.setEnabled(controller !== null && status === 'playing' && !sheetOpen && !results && !listenEnded);
  });

  $effect(() => {
    // Read every dependency before touching the controller so the effect always tracks them;
    // `controller` is $state.raw, so the effect also re-runs once it has been created.
    const { soundOn, volume } = $settings;
    const options = display();
    const active = controller;
    active?.setSound(soundOn, volume);
    active?.setDisplay(options);
  });

  function togglePause() {
    if (status === 'paused') controller?.resume();
    else controller?.pause();
  }

  /** A new run starts: drop stale results and let the next 'finished' show the overlay again. */
  function newRun() {
    results = null;
    listenEnded = false;
    runId++;
    status = 'playing';
  }

  /** Keeps the Play request (for returning from Settings) and the defaults in step with the screen. */
  function rememberChoices() {
    screen.update((s) => (s.name === 'play' ? { ...s, request: { ...s.request, hand, speed } } : s));
    // Listening is not a hand: the next practice keeps the last hand played.
    settings.update((s) => ({ ...s, lastHand: hand === 'none' ? s.lastHand : hand, lastSpeed: speed }));
  }

  function changeSpeed(delta: number) {
    speed = clampSpeed(Math.round((speed + delta) * 100) / 100);
    controller?.setSpeed(speed);
    rememberChoices();
  }

  function changeHand(next: Practice) {
    hand = next;
    newRun();
    // The controller keeps the position only while the run is under way; otherwise it starts over.
    controller?.restart({ practice: next }, true);
    rememberChoices();
  }

  function toggleLoop() {
    if (!song) return;
    if (loop) {
      loop = null;
    } else {
      const start = measureAt(song.measures, Math.max(0, songTime));
      loop = { startMeasure: start, endMeasure: Math.min(measureCount - 1, start + 3) };
    }
    newRun();
    controller?.setLoop(loop);
  }

  function moveLoop(edge: 'start' | 'end', delta: number) {
    if (!loop) return;
    let { startMeasure, endMeasure } = loop;
    if (edge === 'start') startMeasure = Math.min(endMeasure, Math.max(0, startMeasure + delta));
    else endMeasure = Math.max(startMeasure, Math.min(measureCount - 1, endMeasure + delta));
    loop = { startMeasure, endMeasure };
    newRun();
    controller?.setLoop(loop);
  }

  function seekFromBar(event: MouseEvent) {
    if (!song) return;
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    newRun();
    controller?.seek(fraction * song.duration);
  }

  function retry() {
    newRun();
    controller?.restart({}, false);
  }

  const speedPercent = $derived(Math.round(speed * 100));
  const progress = $derived(song && song.duration > 0 ? Math.min(1, Math.max(0, songTime / song.duration)) : 0);
  const loopStyle = $derived.by(() => {
    if (!loop || !song || song.duration <= 0) return '';
    const start = song.measures[loop.startMeasure] / song.duration;
    const end = Math.min(1, song.measures[loop.endMeasure + 1] / song.duration);
    return `left:${start * 100}%;width:${(end - start) * 100}%`;
  });
</script>

<div class="play">
  <canvas bind:this={canvas}></canvas>
  {#if failed}
    <p class="error message">{$t('error.songMissing')}</p>
  {/if}

  <!-- Inert behind the results and listen-end dialogs, so nothing there can be focused or clicked. -->
  <div class="controls" class:dimmed inert={!!results || listenEnded}>
    <div class="top">
      <div class="glass cluster start">
        <button
          class="icon ghost round"
          onclick={() => screen.set({ name: 'setup', songId: request.songId })}
          aria-label={$t('common.back')}
          title={$t('common.back')}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <button
          class="icon primary round"
          onclick={togglePause}
          aria-label={status === 'paused' ? $t('play.resume') : $t('play.pause')}
          title={status === 'paused' ? $t('play.resume') : $t('play.pause')}
        >
          {#if status === 'paused'}
            <PlayIcon size={20} fill="currentColor" aria-hidden="true" />
          {:else}
            <PauseIcon size={20} fill="currentColor" aria-hidden="true" />
          {/if}
        </button>
      </div>

      <div class="glass cluster center">
        <div class="seek" role="presentation" onclick={seekFromBar}>
          <div class="track">
            <div class="fill" style:transform="translateX({(progress - 1) * 100}%)"></div>
            {#if loopStyle}<div class="loop-zone" style={loopStyle}></div>{/if}
          </div>
          <div class="head" style:transform="translateX({progress * 100}%)"><span class="knob"></span></div>
        </div>
        <span class="time"
          >{formatDuration(Math.min(song?.duration ?? 0, Math.max(0, songTime)))}<span class="total"
            >&nbsp;/ {formatDuration(song?.duration ?? 0)}</span
          ></span
        >
      </div>

      <div class="glass cluster end">
        <button
          class="chip"
          onclick={() => (sheetOpen = true)}
          aria-haspopup="dialog"
          aria-label={$t('play.speedLabel', { percent: speedPercent })}
          title={$t('setup.speed')}
        >
          <Gauge size={16} aria-hidden="true" />
          <span>{speedPercent}%</span>
        </button>
        <button
          class="chip"
          onclick={() => (sheetOpen = true)}
          aria-haspopup="dialog"
          aria-label={$t('play.handLabel', { hand: $t(HAND_SHORT_KEYS[hand]) })}
          title={$t('setup.hand')}
        >
          {#if hand === 'none'}
            <Headphones size={16} aria-hidden="true" />
          {:else}
            <HandIcon size={16} aria-hidden="true" />
          {/if}
          <span>{$t(HAND_SHORT_KEYS[hand])}</span>
        </button>
        <span class="conn"><ConnectionBadge compact /></span>
        <button
          class="icon ghost round"
          onclick={() => (sheetOpen = true)}
          aria-haspopup="dialog"
          aria-label={$t('play.options')}
          title={$t('play.options')}
        >
          <Ellipsis size={20} aria-hidden="true" />
        </button>
      </div>
    </div>

    {#if view.showFollow}
      <button class="glass follow" onclick={() => controller?.follow()}>
        <Crosshair size={18} aria-hidden="true" />
        {$t('view.follow')}
      </button>
    {/if}
  </div>

  {#if results}
    <ResultsOverlay
      score={results.score}
      saved={results.saved}
      isNewBest={results.isNewBest}
      bestPercent={results.bestPercent}
      onretry={retry}
      onback={() => screen.set({ name: 'library' })}
    />
  {/if}
  {#if listenEnded}
    <ListenEndOverlay onlisten={retry} onpractice={() => changeHand($settings.lastHand)} />
  {/if}

  <Sheet open={sheetOpen} title={$t('play.options')} onclose={() => (sheetOpen = false)}>
    <PlayOptions
      {hand}
      {speed}
      {loop}
      {measureCount}
      {loopPass}
      {lastLoopScore}
      canLoop={song !== null}
      {view}
      onhand={changeHand}
      onspeed={changeSpeed}
      ontoggleloop={toggleLoop}
      onmoveloop={moveLoop}
      onzoomkeys={(d) => controller?.zoomKeys(d)}
      onzoomtime={(d) => controller?.zoomTime(d)}
      onfit={() => controller?.fit()}
    />
  </Sheet>
</div>

<style>
  .play {
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
  .message {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 24px;
    text-align: center;
  }

  /* ---------- Floating controls ---------- */

  .controls {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 0
      max(12px, env(safe-area-inset-left));
    pointer-events: none;
  }
  /*
   * Dimming fades each capsule rather than the whole layer: an ancestor with opacity < 1 would
   * stop the capsules' backdrop blur from seeing the canvas.
   */
  .cluster,
  .top,
  .follow {
    transition: opacity 0.4s ease;
  }
  .dimmed .cluster,
  .dimmed .follow {
    opacity: 0.35;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .top > *,
  .follow {
    pointer-events: auto;
  }
  .cluster {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
  }
  .round {
    border-radius: var(--radius-pill);
  }
  .icon.primary {
    box-shadow: 0 6px 18px -6px rgba(124, 92, 255, 0.9);
  }

  /* Progress capsule: grows up to 640 px and stays centred in the free space. */
  .center {
    flex: 1 1 0;
    min-width: 0;
    max-width: 640px;
    margin: 0 auto;
    gap: 14px;
    padding: 3px 18px;
  }
  .seek {
    position: relative;
    flex: 1;
    min-width: 0;
    height: var(--tap-sm);
    display: flex;
    align-items: center;
    cursor: pointer;
    touch-action: manipulation;
  }
  .track {
    position: relative;
    width: 100%;
    height: 12px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0;
    border-radius: var(--radius-pill);
    background: var(--accent-gradient);
    will-change: transform;
  }
  .loop-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(124, 92, 255, 0.35);
    box-shadow:
      inset 2px 0 0 rgba(167, 139, 250, 0.9),
      inset -2px 0 0 rgba(167, 139, 250, 0.9);
  }
  /* Full-width rail moved by the progress; its left edge carries the knob. */
  .head {
    position: absolute;
    inset: 0;
    pointer-events: none;
    will-change: transform;
  }
  .knob {
    position: absolute;
    top: 50%;
    left: 0;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 0 0 3px rgba(34, 211, 238, 0.28),
      0 2px 6px rgba(0, 0, 0, 0.5);
  }
  .time {
    flex: none;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .total {
    color: var(--text-dim);
  }

  /* Speed and hand pills: open the options sheet. */
  .chip {
    gap: 6px;
    min-height: var(--tap-sm);
    padding: 0 14px 0 12px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .chip :global(svg) {
    color: var(--cyan);
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

  .follow {
    align-self: center;
    gap: 8px;
    min-height: var(--tap-sm);
    padding: 0 18px 0 14px;
    color: var(--text);
    font-size: 14px;
  }
  .follow :global(svg) {
    color: var(--cyan);
  }

  @media (hover: hover) {
    .chip:hover,
    .conn :global(.badge:hover),
    .follow:hover {
      border-color: var(--border-strong);
    }
  }

  /* Tablet portrait and narrow landscape: elapsed time only. */
  @media (max-width: 767px) {
    .total {
      display: none;
    }
  }

  /* Phone portrait: one full-width capsule with back, play/pause, progress and options. */
  @media (max-width: 599px) {
    .controls {
      padding-right: max(8px, env(safe-area-inset-right));
      padding-left: max(8px, env(safe-area-inset-left));
    }
    .top {
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--border);
      border-radius: var(--radius-pill);
      background: var(--glass);
      -webkit-backdrop-filter: blur(14px);
      backdrop-filter: blur(14px);
      box-shadow: var(--shadow-pop);
      pointer-events: auto;
    }
    .cluster {
      display: contents;
    }
    .dimmed .top {
      opacity: 0.35;
    }
    .seek {
      margin: 0 8px 0 10px;
    }
    .time {
      font-size: 12px;
      color: var(--text-dim);
    }
    .chip,
    .conn {
      display: none;
    }
  }
</style>
