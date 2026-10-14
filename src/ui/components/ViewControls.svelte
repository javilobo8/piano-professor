<script lang="ts">
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import Minus from '@lucide/svelte/icons/minus';
  import MoveHorizontal from '@lucide/svelte/icons/move-horizontal';
  import MoveVertical from '@lucide/svelte/icons/move-vertical';
  import Plus from '@lucide/svelte/icons/plus';
  import { t } from '../app-state';
  import type { ViewState } from '../view-state';

  /** Zoom controls as an inline section (the View part of the options sheet). */
  let {
    view,
    onzoomkeys,
    onzoomtime,
    onfit,
  }: {
    view: ViewState;
    /** 1 = zoom in, -1 = zoom out. */
    onzoomkeys: (direction: 1 | -1) => void;
    onzoomtime: (direction: 1 | -1) => void;
    onfit: () => void;
  } = $props();
</script>

<div class="view-controls">
  <div class="row">
    <span class="name"><MoveHorizontal size={18} aria-hidden="true" />{$t('view.keys')}</span>
    <div class="stepper">
      <button
        class="icon ghost"
        onclick={() => onzoomkeys(-1)}
        disabled={!view.canZoomKeysOut}
        aria-label={$t('view.moreKeys')}
        title={$t('view.moreKeys')}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <button
        class="icon ghost"
        onclick={() => onzoomkeys(1)}
        disabled={!view.canZoomKeysIn}
        aria-label={$t('view.widerKeys')}
        title={$t('view.widerKeys')}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  </div>
  <div class="row">
    <span class="name"><MoveVertical size={18} aria-hidden="true" />{$t('view.time')}</span>
    <div class="stepper">
      <button
        class="icon ghost"
        onclick={() => onzoomtime(-1)}
        disabled={!view.canZoomTimeOut}
        aria-label={$t('view.moreTime')}
        title={$t('view.moreTime')}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <button
        class="icon ghost"
        onclick={() => onzoomtime(1)}
        disabled={!view.canZoomTimeIn}
        aria-label={$t('view.lessTime')}
        title={$t('view.lessTime')}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  </div>
  <button class="fit" onclick={onfit} disabled={!view.canFit}>
    <Maximize2 size={18} aria-hidden="true" />
    {$t('view.fit')}
  </button>
</div>

<style>
  .view-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .name :global(svg) {
    flex: none;
    color: var(--text-dim);
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
  .fit {
    width: 100%;
    margin-top: 4px;
    min-height: var(--tap-sm);
  }
</style>
