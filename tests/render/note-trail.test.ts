import { describe, expect, it } from 'vitest';
import { NoteTrail } from '../../src/render/note-trail';

describe('NoteTrail', () => {
  it('opens a note on and closes it off', () => {
    const trail = new NoteTrail();
    trail.noteOn(60, 0.5, 100);
    expect(trail.visible(200)).toEqual([{ pitch: 60, velocity: 0.5, startMs: 100, endMs: null }]);
    trail.noteOff(60, 300);
    expect(trail.visible(400)).toEqual([{ pitch: 60, velocity: 0.5, startMs: 100, endMs: 300 }]);
  });

  it('closes the open note when a held pitch is pressed again', () => {
    const trail = new NoteTrail();
    trail.noteOn(60, 0.5, 100);
    trail.noteOn(60, 0.9, 250);
    expect(trail.visible(300)).toEqual([
      { pitch: 60, velocity: 0.5, startMs: 100, endMs: 250 },
      { pitch: 60, velocity: 0.9, startMs: 250, endMs: null },
    ]);
  });

  it('ignores an off without an open note', () => {
    const trail = new NoteTrail();
    trail.noteOff(60, 100);
    expect(trail.visible(200)).toEqual([]);
    expect(trail.held()).toEqual([]);
  });

  it('lists held pitches ascending', () => {
    const trail = new NoteTrail();
    trail.noteOn(64, 0.5, 0);
    trail.noteOn(48, 0.5, 0);
    trail.noteOn(60, 0.5, 0);
    trail.noteOff(60, 10);
    expect(trail.held()).toEqual([48, 64]);
  });

  it('drops released notes exactly once they have risen off the top', () => {
    const trail = new NoteTrail();
    trail.noteOn(60, 0.5, 0);
    trail.noteOff(60, 1000);
    expect(trail.visible(3999)).toHaveLength(1);
    expect(trail.visible(4000)).toHaveLength(0);
  });

  it('never drops held notes', () => {
    const trail = new NoteTrail();
    trail.noteOn(60, 0.5, 0);
    expect(trail.visible(1_000_000)).toHaveLength(1);
  });

  it('releaseAll closes every open note', () => {
    const trail = new NoteTrail();
    trail.noteOn(60, 0.5, 0);
    trail.noteOn(64, 0.5, 0);
    trail.releaseAll(500);
    expect(trail.held()).toEqual([]);
    expect(trail.visible(600).map((n) => n.endMs)).toEqual([500, 500]);
  });
});
