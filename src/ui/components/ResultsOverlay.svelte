<script lang="ts">
  import LibraryIcon from '@lucide/svelte/icons/library';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { scorePercent } from '../../engine/scoring';
  import type { Score } from '../../engine/types';
  import type { MessageKey } from '../../i18n';
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
  /** The figures under the percent, in display order. */
  const stats = $derived<{ label: MessageKey; value: string | number }[]>(
    score.kind === 'wait'
      ? [
          { label: 'results.cleanSteps', value: `${score.cleanSteps} / ${score.totalSteps}` },
          { label: 'results.wrongNotes', value: score.wrongNotes },
          { label: 'results.time', value: formatDuration(score.elapsedMs / 1000) },
        ]
      : [
          { label: 'results.hits', value: score.hits },
          { label: 'results.perfects', value: score.perfects },
          { label: 'results.misses', value: score.misses },
          { label: 'results.extras', value: score.extras },
          { label: 'results.bestStreak', value: score.bestStreak },
        ],
  );
</script>

<div class="backdrop">
  <div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="results-title">
    <h2 id="results-title" class="label">{$t('results.title')}</h2>
    <p class="percent">{percent}%</p>
    <p class="caption">{$t(score.kind === 'wait' ? 'results.cleanSteps' : 'results.accuracy')}</p>
    {#if saved && isNewBest}
      <p class="best">{$t('results.newBest')}</p>
    {:else if saved && bestPercent !== null}
      <p class="note">{$t('results.best', { percent: bestPercent })}</p>
    {:else if !saved}
      <p class="note">{$t('results.notSaved')}</p>
    {/if}

    <dl class="stats">
      {#each stats as stat (stat.label)}
        <div class="stat">
          <dt>{$t(stat.label)}</dt>
          <dd>{stat.value}</dd>
        </div>
      {/each}
    </dl>

    <div class="buttons">
      <button onclick={onback}>
        <LibraryIcon size={18} aria-hidden="true" />
        {$t('results.back')}
      </button>
      <button class="primary" onclick={onretry}>
        <RotateCcw size={18} aria-hidden="true" />
        {$t('results.retry')}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    overflow-y: auto;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    background: rgba(4, 6, 14, 0.6);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    animation: fade-in 0.2s ease-out;
  }
  .dialog {
    /* Auto margins centre the card and still let a tall one scroll from its top. */
    margin: auto;
    width: 100%;
    max-width: 440px;
    padding: 24px;
    border-color: var(--border-strong);
    background: var(--surface-solid);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    text-align: center;
  }
  h2 {
    margin: 0;
  }
  .percent {
    margin: 4px 0 0;
    font-size: 56px;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .caption {
    margin: 2px 0 0;
    color: var(--text-dim);
    font-size: 14px;
  }
  .best,
  .note {
    margin: 12px auto 0;
  }
  .best {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 4px 14px;
    border: 1px solid rgba(52, 211, 153, 0.45);
    border-radius: var(--radius-pill);
    background: rgba(52, 211, 153, 0.12);
    color: var(--success);
    font-size: 13px;
    font-weight: 700;
  }
  .note {
    color: var(--text-dim);
    font-size: 13px;
  }
  /* Three per row on a six-column grid; a last row of two shares the width evenly. */
  .stats {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
    margin: 20px 0 24px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
    padding: 10px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    grid-column: span 2;
  }
  .stat:nth-child(3n + 1):nth-last-child(2),
  .stat:nth-child(3n + 2):nth-last-child(1) {
    grid-column: span 3;
  }
  dt {
    color: var(--text-dim);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  dd {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* Side by side when they fit; stacked with the main action on top otherwise. */
  .buttons {
    display: flex;
    flex-wrap: wrap-reverse;
    gap: 10px;
  }
  .buttons button {
    flex: 1 1 160px;
    min-width: 0;
    padding: 0 12px;
  }

  /* Phones on their side: a tighter card so it fits without scrolling. */
  @media (max-height: 480px) {
    .dialog {
      padding: 16px 20px;
    }
    .percent {
      font-size: 44px;
    }
    .stats {
      margin: 12px 0 16px;
    }
    .stat {
      padding: 6px 8px;
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
</style>
