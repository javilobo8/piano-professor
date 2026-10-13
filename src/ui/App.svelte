<script lang="ts">
  import { onMount } from 'svelte';
  import { connection, screen, settings } from './app-state';
  import Library from './screens/Library.svelte';
  import Play from './screens/Play.svelte';
  import Settings from './screens/Settings.svelte';
  import SongSetup from './screens/SongSetup.svelte';

  onMount(() => {
    void connection.startUsb($settings.preferredDevice);
  });

  $effect(() => {
    document.documentElement.lang = $settings.language;
  });
</script>

{#if $screen.name === 'library'}
  <Library />
{:else if $screen.name === 'setup'}
  {#key $screen.songId}
    <SongSetup songId={$screen.songId} />
  {/key}
{:else if $screen.name === 'play'}
  <Play request={$screen.request} />
{:else if $screen.name === 'settings'}
  <Settings back={$screen.back} />
{/if}
