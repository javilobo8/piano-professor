<script lang="ts">
  import { t } from '../app-state';
  import type { ViewState } from '../view-state';

  let {
    view,
    onzoomkeys,
    onzoomtime,
    onfit,
    onfollow,
  }: {
    view: ViewState;
    /** 1 = zoom in, -1 = zoom out. */
    onzoomkeys: (direction: 1 | -1) => void;
    onzoomtime: (direction: 1 | -1) => void;
    onfit: () => void;
    onfollow?: () => void;
  } = $props();
</script>

<div class="view-controls">
  <div class="row">
    <span class="axis" aria-hidden="true">↔</span>
    <button
      onclick={() => onzoomkeys(-1)}
      disabled={!view.canZoomKeysOut}
      aria-label={$t('view.moreKeys')}
      title={$t('view.moreKeys')}>−</button
    >
    <button
      onclick={() => onzoomkeys(1)}
      disabled={!view.canZoomKeysIn}
      aria-label={$t('view.widerKeys')}
      title={$t('view.widerKeys')}>+</button
    >
  </div>
  <div class="row">
    <span class="axis" aria-hidden="true">↕</span>
    <button
      onclick={() => onzoomtime(-1)}
      disabled={!view.canZoomTimeOut}
      aria-label={$t('view.moreTime')}
      title={$t('view.moreTime')}>−</button
    >
    <button
      onclick={() => onzoomtime(1)}
      disabled={!view.canZoomTimeIn}
      aria-label={$t('view.lessTime')}
      title={$t('view.lessTime')}>+</button
    >
  </div>
  <button class="wide" onclick={onfit} disabled={!view.canFit}>{$t('view.fit')}</button>
  {#if view.showFollow && onfollow}
    <button class="wide primary" onclick={onfollow}>{$t('view.follow')}</button>
  {/if}
</div>

<style>
  .view-controls {
    position: absolute;
    top: 12px;
    right: max(12px, env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    background: rgba(27, 30, 39, 0.8);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  .view-controls:hover,
  .view-controls:focus-within,
  .view-controls:active {
    opacity: 1;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .axis {
    width: 20px;
    text-align: center;
    color: var(--text-dim);
  }
  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0 10px;
  }
  .wide {
    width: 100%;
  }
</style>
