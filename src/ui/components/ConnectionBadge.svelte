<script lang="ts">
  import { connectionStatus, screen, t } from '../app-state';

  /** `compact` shows only the status dot in a round 44 px button. */
  let { compact = false }: { compact?: boolean } = $props();

  const label = $derived(
    $connectionStatus.state === 'connected'
      ? $t('conn.connected', { name: $connectionStatus.name })
      : $connectionStatus.state === 'connecting'
        ? $t('conn.connecting')
        : $t('conn.disconnected'),
  );

  function openSettings() {
    screen.update((current) => ({ name: 'settings', back: current }));
  }
</script>

<button class="badge" class:compact onclick={openSettings} title={label} aria-label={label}>
  <span class="dot {$connectionStatus.state}" aria-hidden="true"></span>
  {#if !compact}<span class="text">{label}</span>{/if}
</button>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
    min-height: var(--tap-sm);
    padding: 0 16px 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--glass);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    font-size: 13px;
    font-weight: 600;
  }
  .badge.compact {
    justify-content: center;
    width: var(--tap-sm);
    min-width: var(--tap-sm);
    height: var(--tap-sm);
    padding: 0;
  }
  .text {
    min-width: 0;
    max-width: 220px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--danger);
  }
  .dot.connected {
    background: var(--success);
    box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.25);
  }
  .dot.connecting {
    background: var(--warning);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  @media (hover: hover) {
    .badge:hover {
      background: var(--glass);
      border-color: var(--border-strong);
    }
  }
</style>
