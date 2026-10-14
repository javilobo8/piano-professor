<script lang="ts">
  import Headphones from '@lucide/svelte/icons/headphones';
  import PlayIcon from '@lucide/svelte/icons/play';
  import { t } from '../app-state';

  let { onlisten, onpractice }: { onlisten: () => void; onpractice: () => void } = $props();
  /** Takes focus when the dialog appears, so keyboard users land on its main action. */
  function focusOnMount(button: HTMLElement) {
    button.focus({ preventScroll: true });
  }
</script>

<div class="backdrop">
  <div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="listen-end-title">
    <span class="card-icon badge" aria-hidden="true"><Headphones size={22} /></span>
    <h2 id="listen-end-title">{$t('listen.ended')}</h2>
    <div class="buttons">
      <button onclick={onlisten}>
        <Headphones size={18} aria-hidden="true" />
        {$t('listen.again')}
      </button>
      <button class="primary" onclick={onpractice} {@attach focusOnMount}>
        <PlayIcon size={18} fill="currentColor" aria-hidden="true" />
        {$t('listen.practice')}
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
  .badge {
    width: 48px;
    height: 48px;
    margin: 0 auto 12px;
    border-radius: var(--radius);
  }
  h2 {
    margin: 0 0 24px;
    font-size: 22px;
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

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
</style>
