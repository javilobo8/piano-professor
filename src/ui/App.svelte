<script lang="ts">
  import { onMount } from 'svelte';
  import { connection, screen, settings, webPiano } from './app-state';
  import FreePlay from './screens/FreePlay.svelte';
  import Library from './screens/Library.svelte';
  import Play from './screens/Play.svelte';
  import Settings from './screens/Settings.svelte';
  import SongSetup from './screens/SongSetup.svelte';

  onMount(() => {
    void connection.startUsb($settings.preferredDevice);
    // Browsers keep audio suspended until a user gesture: wake the browser piano on every tap or key.
    const wake = () => webPiano.resume();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') webPiano.resume();
    };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
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
{:else if $screen.name === 'freePlay'}
  <FreePlay />
{:else if $screen.name === 'settings'}
  <Settings back={$screen.back} />
{/if}
