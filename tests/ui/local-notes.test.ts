import { describe, expect, it } from 'vitest';
import { LocalNotes } from '../../src/ui/local-notes';

describe('LocalNotes', () => {
  it('reports the first press and the last release of a pitch', () => {
    const notes = new LocalNotes();
    expect(notes.press(60)).toBe(true);
    expect(notes.press(60)).toBe(false);
    expect(notes.has(60)).toBe(true);
    expect(notes.release(60)).toBe(false);
    expect(notes.release(60)).toBe(true);
    expect(notes.has(60)).toBe(false);
  });

  it('ignores a release without a press', () => {
    const notes = new LocalNotes();
    expect(notes.release(60)).toBe(false);
    expect(notes.has(60)).toBe(false);
  });
});
