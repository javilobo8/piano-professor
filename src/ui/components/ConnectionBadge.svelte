<script lang="ts">
  import { connectionStatus, screen, t } from '../app-state';

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

<button class="badge ghost" class:compact onclick={openSettings} title={label} aria-label={label}>
  <span class="dot {$connectionStatus.state}"></span>
  {#if !compact}<span class="text">{label}</span>{/if}
</button>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 260px;
  }
  .badge.compact {
    padding: 0 14px;
  }
  .text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .dot {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--danger);
  }
  .dot.connected {
    background: var(--ok);
  }
  .dot.connecting {
    background: var(--accent);
  }
</style>
