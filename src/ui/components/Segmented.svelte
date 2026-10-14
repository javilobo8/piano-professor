<script lang="ts" generics="T extends string">
  let {
    options,
    value,
    onchange,
    label,
    full = false,
  }: {
    options: { value: T; label: string }[];
    value: T;
    onchange: (value: T) => void;
    label: string;
    /** Stretch to the full width, options in equal parts. */
    full?: boolean;
  } = $props();
</script>

<div class="segmented" class:full role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <button
      role="radio"
      aria-checked={option.value === value}
      class:selected={option.value === value}
      title={option.label}
      onclick={() => onchange(option.value)}
    >
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    justify-self: start;
    gap: 2px;
    width: fit-content;
    max-width: 100%;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius-sm) + 3px);
    background: var(--surface);
  }
  .segmented.full {
    display: flex;
    justify-self: stretch;
    width: 100%;
  }
  button {
    flex: 0 1 auto;
    min-width: 0;
    min-height: var(--tap-sm);
    padding: 0 16px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 600;
    transform: none;
  }
  span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .full button {
    flex: 1 1 0;
    padding: 0 10px;
  }
  button.selected {
    background: var(--accent-soft);
    color: #fff;
    font-weight: 700;
    box-shadow: inset 0 0 0 1px rgba(124, 92, 255, 0.45);
  }
  @media (hover: hover) {
    button:not(.selected):hover {
      background: var(--surface);
      color: var(--text);
    }
  }
</style>
