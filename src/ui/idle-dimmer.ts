export interface IdleDimmer {
  /** Something happened: undim and restart the wait. */
  poke(): void;
  /** Dimming only happens while enabled (e.g. while the song plays and no panel is open). */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/** Calls onChange(true) after `delayMs` without a poke while enabled, and onChange(false) when that ends. */
export function createIdleDimmer(options: { delayMs: number; onChange: (dimmed: boolean) => void }): IdleDimmer {
  let enabled = false;
  let dimmed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const set = (next: boolean) => {
    if (next === dimmed) return;
    dimmed = next;
    options.onChange(next);
  };
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const restart = () => {
    stop();
    timer = setTimeout(() => {
      timer = null;
      set(true);
    }, options.delayMs);
  };

  return {
    poke() {
      set(false);
      if (enabled) restart();
    },
    setEnabled(next) {
      if (next === enabled) return;
      enabled = next;
      if (enabled) restart();
      else {
        stop();
        set(false);
      }
    },
    dispose() {
      enabled = false;
      stop();
      set(false);
    },
  };
}
