<script lang="ts" generics="T extends string">
  let {
    options,
    value,
    onchange,
    label,
  }: {
    options: { value: T; label: string }[];
    value: T;
    onchange: (value: T) => void;
    label: string;
  } = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <button
      role="radio"
      aria-checked={option.value === value}
      class:selected={option.value === value}
      onclick={() => onchange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    justify-self: start;
    width: fit-content;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  button {
    border: none;
    border-radius: 0;
    background: var(--surface-2);
  }
  button + button {
    border-left: 1px solid var(--border);
  }
  button.selected {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
  }
</style>
