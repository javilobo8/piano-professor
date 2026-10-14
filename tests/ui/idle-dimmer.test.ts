import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleDimmer } from '../../src/ui/idle-dimmer';

describe('idle dimmer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const changes: boolean[] = [];
    const dimmer = createIdleDimmer({ delayMs: 3000, onChange: (d) => changes.push(d) });
    return { changes, dimmer };
  }

  it('does nothing while disabled', () => {
    const { changes } = setup();
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([]);
  });

  it('dims after the delay once enabled, and only once', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(2999);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([true]);
  });

  it('a poke undims and restarts the wait', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(3000);
    dimmer.poke();
    expect(changes).toEqual([true, false]);
    vi.advanceTimersByTime(2999);
    expect(changes).toEqual([true, false]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false, true]);
  });

  it('a poke before dimming only restarts the wait', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(2000);
    dimmer.poke();
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
  });

  it('disabling undims and stops the wait', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(3000);
    dimmer.setEnabled(false);
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([true, false]);
  });

  it('re-enabling while enabled does not restart a running wait', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(2000);
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
  });

  it('dispose undims and cancels the timer', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(3000);
    dimmer.dispose();
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([true, false]);
  });
});
