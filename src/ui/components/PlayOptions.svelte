<script lang="ts">
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  import { scorePercent } from '../../engine/scoring';
  import { MAX_SPEED, MIN_SPEED } from '../../engine/session';
  import type { LoopRange, Practice, Score } from '../../engine/types';
  import type { MessageKey } from '../../i18n';
  import { t } from '../app-state';
  import type { ViewState } from '../view-state';
  import Segmented from './Segmented.svelte';
  import ViewControls from './ViewControls.svelte';

  /** Body of the Play options sheet: hand, speed, A–B loop and view. Presentational; Play owns the state. */
  let {
    hand,
    speed,
    loop,
    measureCount,
    loopPass,
    lastLoopScore,
    canLoop,
    view,
    onhand,
    onspeed,
    ontoggleloop,
    onmoveloop,
    onzoomkeys,
    onzoomtime,
    onfit,
  }: {
    hand: Practice;
    speed: number;
    loop: LoopRange | null;
    /** Number of playable measures (the loop end stays below it). */
    measureCount: number;
    loopPass: number;
    lastLoopScore: Score | null;
    /** False until the song has loaded. */
    canLoop: boolean;
    view: ViewState;
    onhand: (hand: Practice) => void;
    /** Adds `delta` (e.g. 0.05) to the speed. */
    onspeed: (delta: number) => void;
    ontoggleloop: () => void;
    onmoveloop: (edge: 'start' | 'end', delta: number) => void;
    onzoomkeys: (direction: 1 | -1) => void;
    onzoomtime: (direction: 1 | -1) => void;
    onfit: () => void;
  } = $props();

  const HANDS: Practice[] = ['right', 'left', 'both', 'none'];
  const HAND_LABELS: Record<Practice, MessageKey> = {
    right: 'hand.right',
    left: 'hand.left',
    both: 'hand.both',
    none: 'hand.short.none',
  };
  const SPEED_STEP = 0.05;

  const ids = $props.id();
</script>

<div class="options">
  <section aria-labelledby="{ids}-hand">
    <h3 class="label" id="{ids}-hand">{$t('setup.hand')}</h3>
    <Segmented
      full
      label={$t('setup.hand')}
      options={HANDS.map((h) => ({ value: h, label: $t(HAND_LABELS[h]) }))}
      value={hand}
      onchange={onhand}
    />
  </section>

  <section class="row" aria-labelledby="{ids}-speed">
    <h3 class="label" id="{ids}-speed">{$t('setup.speed')}</h3>
    <div class="stepper">
      <button
        class="icon ghost"
        onclick={() => onspeed(-SPEED_STEP)}
        disabled={speed <= MIN_SPEED}
        aria-label={$t('play.slower')}
        title={$t('play.slower')}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <output class="value wide">{Math.round(speed * 100)}%</output>
      <button
        class="icon ghost"
        onclick={() => onspeed(SPEED_STEP)}
        disabled={speed >= MAX_SPEED}
        aria-label={$t('play.faster')}
        title={$t('play.faster')}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  </section>

  <section aria-labelledby="{ids}-loop">
    <div class="row">
      <label class="label switch-label" id="{ids}-loop" for="{ids}-loop-switch">{$t('play.loopTitle')}</label>
      <!-- A button, not a checkbox: the PC-keyboard piano ignores keys while an input has focus. -->
      <button
        id="{ids}-loop-switch"
        type="button"
        class="switch"
        role="switch"
        aria-checked={loop !== null}
        aria-labelledby="{ids}-loop"
        disabled={!canLoop}
        onclick={ontoggleloop}
      ></button>
    </div>
    {#if loop}
      <div class="row">
        <span class="edge"><span class="tag" aria-hidden="true">{$t('play.loopFrom')}</span>{$t('play.loopStart')}</span>
        <div class="stepper">
          <button
            class="icon ghost"
            onclick={() => onmoveloop('start', -1)}
            disabled={loop.startMeasure <= 0}
            aria-label={$t('play.loopStartEarlier')}
            title={$t('play.loopStartEarlier')}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <output class="value">{loop.startMeasure + 1}</output>
          <button
            class="icon ghost"
            onclick={() => onmoveloop('start', 1)}
            disabled={loop.startMeasure >= loop.endMeasure}
            aria-label={$t('play.loopStartLater')}
            title={$t('play.loopStartLater')}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="row">
        <span class="edge"><span class="tag" aria-hidden="true">{$t('play.loopTo')}</span>{$t('play.loopEnd')}</span>
        <div class="stepper">
          <button
            class="icon ghost"
            onclick={() => onmoveloop('end', -1)}
            disabled={loop.endMeasure <= loop.startMeasure}
            aria-label={$t('play.loopEndEarlier')}
            title={$t('play.loopEndEarlier')}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <output class="value">{loop.endMeasure + 1}</output>
          <button
            class="icon ghost"
            onclick={() => onmoveloop('end', 1)}
            disabled={loop.endMeasure >= measureCount - 1}
            aria-label={$t('play.loopEndLater')}
            title={$t('play.loopEndLater')}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {#if loopPass > 0 && lastLoopScore}
        <p class="pass" aria-live="polite">
          {$t('play.loopPass', { n: loopPass, percent: scorePercent(lastLoopScore) })}
        </p>
      {/if}
    {/if}
  </section>

  <section aria-labelledby="{ids}-view">
    <h3 class="label" id="{ids}-view">{$t('play.view')}</h3>
    <ViewControls {view} {onzoomkeys} {onzoomtime} {onfit} />
  </section>
</div>

<style>
  .options {
    display: flex;
    flex-direction: column;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 0;
    border-top: 1px solid var(--border);
  }
  section:first-child {
    padding-top: 4px;
    border-top: none;
  }
  section:last-child {
    padding-bottom: 0;
  }
  h3 {
    margin: 0;
  }
  .row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .switch-label {
    flex: 1;
    min-width: 0;
    min-height: var(--tap-sm);
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .edge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .tag {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: var(--accent-soft);
    color: #fff;
    font-size: 12px;
    font-weight: 800;
  }
  .stepper {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface);
  }
  .stepper button {
    border-radius: var(--radius-pill);
  }
  .value {
    min-width: 40px;
    text-align: center;
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .value.wide {
    min-width: 56px;
  }
  .pass {
    align-self: flex-start;
    margin: 0;
    padding: 6px 12px;
    border: 1px solid rgba(34, 211, 238, 0.35);
    border-radius: var(--radius-pill);
    background: rgba(34, 211, 238, 0.1);
    color: var(--cyan);
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
