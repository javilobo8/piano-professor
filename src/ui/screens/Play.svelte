<script lang="ts">
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
  import ResultsOverlay from '../components/ResultsOverlay.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { formatDuration, measureAt } from '../format';
  import { HAND_SHORT_KEYS } from '../labels';
  import { PlayController, type DisplayOptions } from '../play-controller';
  import { loadSong } from '../song-loader';

  let { request }: { request: PlayRequest } = $props();

  const HANDS: Practice[] = ['right', 'left', 'both', 'none'];

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
  let wakeLock: WakeLockSentinel | null = null;

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
    );
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

  const progress = $derived(song && song.duration > 0 ? Math.min(1, Math.max(0, songTime / song.duration)) : 0);
  const loopStyle = $derived.by(() => {
    if (!loop || !song || song.duration <= 0) return '';
    const start = song.measures[loop.startMeasure] / song.duration;
    const end = Math.min(1, song.measures[loop.endMeasure + 1] / song.duration);
    return `left:${start * 100}%;width:${(end - start) * 100}%`;
  });
</script>

<div class="play">
  <header class="bar">
    <button class="ghost" onclick={() => screen.set({ name: 'setup', songId: request.songId })} aria-label={$t('common.back')}
      >←</button
    >
    <button onclick={togglePause} aria-label={status === 'paused' ? $t('play.resume') : $t('play.pause')}>
      {status === 'paused' ? '▶' : '❚❚'}
    </button>

    <div class="progress" role="presentation" onclick={seekFromBar}>
      {#if loopStyle}<div class="loop-zone" style={loopStyle}></div>{/if}
      <div class="fill" style="width:{progress * 100}%"></div>
    </div>
    <span class="time">{formatDuration(Math.min(song?.duration ?? 0, Math.max(0, songTime)))} / {formatDuration(song?.duration ?? 0)}</span>

    <div class="group">
      <button onclick={() => changeSpeed(-0.05)} disabled={speed <= 0.25} aria-label="−5%">−</button>
      <span class="value">{Math.round(speed * 100)}%</span>
      <button onclick={() => changeSpeed(0.05)} disabled={speed >= 1.5} aria-label="+5%">+</button>
    </div>

    <Segmented
      label={$t('setup.hand')}
      options={HANDS.map((h) => ({ value: h, label: $t(HAND_SHORT_KEYS[h]) }))}
      value={hand}
      onchange={changeHand}
    />

    <div class="group">
      <button class:active={loop !== null} onclick={toggleLoop}>{$t('play.loop')}</button>
      {#if loop}
        <span class="dim">{$t('play.loopFrom')}</span>
        <button onclick={() => moveLoop('start', -1)} aria-label={`${$t('play.loopFrom')} −`}>−</button>
        <span class="value">{loop.startMeasure + 1}</span>
        <button onclick={() => moveLoop('start', 1)} aria-label={`${$t('play.loopFrom')} +`}>+</button>
        <span class="dim">{$t('play.loopTo')}</span>
        <button onclick={() => moveLoop('end', -1)} aria-label={`${$t('play.loopTo')} −`}>−</button>
        <span class="value">{loop.endMeasure + 1}</span>
        <button onclick={() => moveLoop('end', 1)} aria-label={`${$t('play.loopTo')} +`}>+</button>
        {#if loopPass > 0 && lastLoopScore}
          <span class="pass">{$t('play.loopPass', { n: loopPass, percent: scorePercent(lastLoopScore) })}</span>
        {/if}
      {/if}
    </div>

    <ConnectionBadge compact />
  </header>

  <div class="stage">
    <canvas bind:this={canvas}></canvas>
    {#if failed}
      <p class="error message">{$t('error.songMissing')}</p>
    {/if}
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
  </div>
</div>

<style>
  .play {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #12141a;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left));
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .bar button {
    min-height: 44px;
    padding: 0 12px;
  }
  .progress {
    position: relative;
    flex: 1 1 160px;
    height: 14px;
    border-radius: 7px;
    background: var(--surface-2);
    cursor: pointer;
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--accent);
    opacity: 0.85;
  }
  .loop-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(232, 195, 90, 0.35);
  }
  .time {
    font-variant-numeric: tabular-nums;
    min-width: 92px;
    text-align: center;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .value {
    min-width: 40px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .active {
    background: var(--accent);
    color: var(--accent-text);
  }
  .pass {
    margin-left: 6px;
    color: var(--accent);
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
  .message {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
  }
</style>
