<script lang="ts">
  import { scorePercent } from '../../engine/scoring';
  import type { Score } from '../../engine/types';
  import { t } from '../app-state';
  import { formatDuration } from '../format';

  let {
    score,
    saved,
    isNewBest,
    bestPercent,
    onretry,
    onback,
  }: {
    score: Score;
    /** False for runs with a loop or jumps. */
    saved: boolean;
    isNewBest: boolean;
    bestPercent: number | null;
    onretry: () => void;
    onback: () => void;
  } = $props();

  const percent = $derived(scorePercent(score));
</script>

<div class="backdrop">
  <div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="results-title">
    <h2 id="results-title">{$t('results.title')}</h2>
    <p class="percent">{percent}%</p>
    <p class="caption dim">{$t(score.kind === 'wait' ? 'results.cleanSteps' : 'results.accuracy')}</p>
    {#if saved && isNewBest}
      <p class="best">{$t('results.newBest')}</p>
    {:else if saved && bestPercent !== null}
      <p class="dim">{$t('results.best', { percent: bestPercent })}</p>
    {:else if !saved}
      <p class="dim">{$t('results.notSaved')}</p>
    {/if}

    <dl>
      {#if score.kind === 'wait'}
        <dt>{$t('results.cleanSteps')}</dt>
        <dd>{score.cleanSteps} / {score.totalSteps}</dd>
        <dt>{$t('results.wrongNotes')}</dt>
        <dd>{score.wrongNotes}</dd>
        <dt>{$t('results.time')}</dt>
        <dd>{formatDuration(score.elapsedMs / 1000)}</dd>
      {:else}
        <dt>{$t('results.hits')}</dt>
        <dd>{score.hits}</dd>
        <dt>{$t('results.perfects')}</dt>
        <dd>{score.perfects}</dd>
        <dt>{$t('results.misses')}</dt>
        <dd>{score.misses}</dd>
        <dt>{$t('results.extras')}</dt>
        <dd>{score.extras}</dd>
        <dt>{$t('results.bestStreak')}</dt>
        <dd>{score.bestStreak}</dd>
      {/if}
    </dl>

    <div class="buttons">
      <button onclick={onback}>{$t('results.back')}</button>
      <button class="primary" onclick={onretry}>{$t('results.retry')}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
    padding: 16px;
  }
  .dialog {
    width: min(420px, 100%);
    text-align: center;
  }
  h2 {
    margin: 0;
  }
  .percent {
    font-size: 3.5rem;
    font-weight: 800;
    margin: 8px 0 0;
  }
  .caption {
    margin: 0 0 8px;
  }
  .best {
    color: var(--accent);
    font-weight: 700;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 16px;
    text-align: left;
    margin: 16px 0;
  }
  dd {
    margin: 0;
    font-weight: 600;
    text-align: right;
  }
  .buttons {
    display: flex;
    gap: 10px;
    justify-content: center;
  }
</style>
