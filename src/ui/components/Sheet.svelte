<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import type { Snippet } from 'svelte';
  import { t } from '../app-state';

  /**
   * Options panel: a bottom sheet below 720 px wide, a floating panel anchored top-right above.
   * Tapping the backdrop or pressing Escape calls `onclose`. Only Escape is handled here, and no
   * event is stopped, so the PC-keyboard piano (listening on `window`) and MIDI keep working.
   */
  let {
    open,
    title,
    onclose,
    children,
  }: {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  const titleId = $props.id();

  function onKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onclose();
  }

  /** Moves focus into the panel while it is shown and back to the opener when it goes away. */
  function manageFocus(panel: HTMLElement) {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="backdrop" aria-hidden="true" onclick={onclose}></div>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    {@attach manageFocus}
  >
    <div class="grab" aria-hidden="true"></div>
    <header class="head">
      <h2 class="title" id={titleId} {title}>{title}</h2>
      <button class="icon ghost" onclick={onclose} aria-label={$t('common.close')} title={$t('common.close')}>
        <X size={20} aria-hidden="true" />
      </button>
    </header>
    <div class="body">
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(4, 6, 14, 0.55);
    animation: fade-in 0.2s ease-out;
  }

  .panel {
    position: fixed;
    z-index: 51;
    display: flex;
    flex-direction: column;
    background: var(--surface-solid);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-pop);
    color: var(--text);
    overflow: hidden;
  }
  .panel:focus,
  .panel:focus-visible {
    outline: none;
  }

  .grab {
    flex: none;
    width: 36px;
    height: 4px;
    margin: 8px auto 0;
    border-radius: var(--radius-pill);
    background: var(--border-strong);
  }

  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    padding: 6px 8px 6px 20px;
  }
  .title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .head button {
    flex: none;
    color: var(--text-dim);
  }

  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 4px 20px 20px;
  }

  /* Bottom sheet. */
  @media (max-width: 719px) {
    .panel {
      left: 0;
      right: 0;
      bottom: 0;
      max-height: 75dvh;
      padding-bottom: max(16px, env(safe-area-inset-bottom));
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
      border-bottom: none;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      animation: slide-up 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .head {
      min-height: 52px;
    }
    .body {
      padding-bottom: 4px;
    }
  }

  /* Floating panel anchored under the top-right of the header. */
  @media (min-width: 720px) {
    .panel {
      top: max(64px, calc(env(safe-area-inset-top) + 56px));
      right: max(12px, env(safe-area-inset-right));
      width: 360px;
      max-height: calc(100dvh - 88px);
      border-radius: var(--radius-lg);
      transform-origin: top right;
      animation: pop-in 0.15s ease-out;
    }
    .grab {
      display: none;
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes slide-up {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
  }
</style>
