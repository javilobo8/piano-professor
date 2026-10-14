<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Piano from '@lucide/svelte/icons/piano';
  import Settings from '@lucide/svelte/icons/settings';
  import type { Snippet } from 'svelte';
  import { screen, t } from '../app-state';
  import ConnectionBadge from './ConnectionBadge.svelte';

  /**
   * Top bar of a menu screen, placed first inside `.screen` (which supplies the side insets).
   * Without a `title` prop it shows the brand; with one (even empty, while loading) it shows the title.
   * `children` go on the right, before the connection pill.
   */
  let {
    title,
    onback,
    showSettings = true,
    showConnection = true,
    children,
  }: {
    title?: string;
    onback?: () => void;
    showSettings?: boolean;
    /** Off where the screen shows the connection itself (Settings). */
    showConnection?: boolean;
    children?: Snippet;
  } = $props();

  function openSettings() {
    screen.update((current) => ({ name: 'settings', back: current }));
  }
</script>

<header class="app-header">
  {#if onback}
    <button class="icon ghost" onclick={onback} aria-label={$t('common.back')} title={$t('common.back')}>
      <ArrowLeft size={20} aria-hidden="true" />
    </button>
  {/if}

  {#if title !== undefined}
    <h1 class="title" {title}>{title}</h1>
  {:else}
    <div class="brand">
      <span class="mark"><Piano size={18} aria-hidden="true" /></span>
      <h1 class="name">{$t('app.title')}</h1>
    </div>
  {/if}

  <div class="end">
    {@render children?.()}
    {#if showConnection}
      <span class="badge-full"><ConnectionBadge /></span>
      <span class="badge-compact"><ConnectionBadge compact /></span>
    {/if}
    {#if showSettings}
      <button class="icon ghost" onclick={openSettings} aria-label={$t('settings.title')} title={$t('settings.title')}>
        <Settings size={20} aria-hidden="true" />
      </button>
    {/if}
  </div>
</header>

<style>
  .app-header {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: max(12px, env(safe-area-inset-top)) 0 12px;
  }
  .title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .brand {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    background: var(--accent-gradient);
    color: #fff;
    box-shadow: var(--shadow-glow);
  }
  .name {
    min-width: 0;
    margin: 0;
    line-height: inherit;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.01em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .end {
    flex: 0 1 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .badge-full,
  .badge-compact {
    display: contents;
  }
  .badge-compact {
    display: none;
  }
  @media (max-width: 599px) {
    .title {
      font-size: 24px;
    }
    .badge-full {
      display: none;
    }
    .badge-compact {
      display: contents;
    }
  }
</style>
