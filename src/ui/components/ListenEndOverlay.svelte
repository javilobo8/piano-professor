<script lang="ts">
  import { t } from '../app-state';

  let { onlisten, onpractice }: { onlisten: () => void; onpractice: () => void } = $props();
</script>

<div class="backdrop">
  <div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="listen-end-title">
    <h2 id="listen-end-title">{$t('listen.ended')}</h2>
    <div class="buttons">
      <button onclick={onlisten}>{$t('listen.again')}</button>
      <button class="primary" onclick={onpractice}>{$t('listen.practice')} ▶</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
    padding: 16px;
  }
  .dialog {
    width: min(420px, 100%);
    text-align: center;
  }
  h2 {
    margin: 0 0 16px;
  }
  .buttons {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
  }
</style>
