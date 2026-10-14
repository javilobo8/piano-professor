import { describe, expect, it } from 'vitest';
import { followTarget } from '../../src/render/follow';
import { maxNoteDuration } from '../../src/render/renderer';
import { Viewport } from '../../src/render/viewport';
import type { PlayableNote, PlayRole } from '../../src/song/types';
import { pn } from '../helpers/make-midi';

const RIGHT: ReadonlySet<PlayRole> = new Set(['right']);

/**
 * 88 keys, 26 white keys in 520 px: 20 px keys, content 1040 px, max scroll 520.
 * White key x: A0 0, C2 180, C4 460, C6 740, C8 1020. Centred on C4: view [210, 730].
 */
function view(whiteKeys = 26, center = 60): Viewport {
  const v = new Viewport(21, 108, { whiteKeys, seconds: 3 });
  v.resize(520);
  v.centerOn(center);
  return v;
}

const target = (notes: PlayableNote[], v: Viewport, songTime = 0, roles = RIGHT) =>
  followTarget(notes, maxNoteDuration(notes), roles, songTime, v);

describe('followTarget', () => {
  it('stays put while the next notes are on screen', () => {
    expect(target([pn(60, 0, 1)], view())).toBeNull();
  });

  it('stays put with nothing to follow', () => {
    expect(target([pn(84, 0, 1, 'left')], view())).toBeNull();
    expect(target([pn(84, 0, 1, 'accompaniment')], view())).toBeNull();
    expect(target([pn(84, 0, 1)], view(), 2)).toBeNull(); // already over
    expect(target([pn(84, 5, 1)], view(), 0)).toBeNull(); // beyond the 3 s on screen
  });

  it('moves just enough to the right, keeping a white key of margin', () => {
    expect(target([pn(84, 0, 1)], view())).toBe(260);
  });

  it('moves just enough to the left, keeping a white key of margin', () => {
    expect(target([pn(36, 0, 1)], view())).toBe(160);
  });

  it('follows the given roles', () => {
    expect(target([pn(84, 0, 1, 'left')], view(), 0, new Set(['left']))).toBe(260);
  });

  it('keeps the earliest notes when they do not all fit', () => {
    expect(target([pn(60, 0, 1), pn(84, 0.5, 1), pn(36, 1, 1)], view())).toBe(260);
  });

  it('puts the notes starting next before notes already sounding', () => {
    // C2 started 2 s ago and still sounds; C6 comes next but both do not fit: C6 wins.
    expect(target([pn(36, -2, 5), pn(84, 0.2, 1)], view())).toBe(260);
  });

  it('never hides the next note behind one still sounding', () => {
    // 8 white keys of 65 px centred on C4: view [1267.5, 1787.5]. C2 (x 585) still
    // sounds; G3 (x 1300) comes next. They do not fit together, so G3 is shown with margin.
    expect(target([pn(36, -2, 5), pn(55, 0.2, 1)], view(8))).toBe(1235);
  });

  it('adds notes still sounding while they fit', () => {
    // C6 comes next and C4 still sounds: both fit, the view moves just enough for C6.
    expect(target([pn(60, -1, 3), pn(84, 0.2, 1)], view())).toBe(260);
    // C2 still sounds and C4 comes next (on screen): both fit, so the view moves left for C2.
    expect(target([pn(36, -1, 3), pn(60, 0.2, 1)], view())).toBe(160);
  });

  it('follows a note still sounding when nothing new starts', () => {
    expect(target([pn(36, -2, 5)], view())).toBe(160);
  });

  it('ignores notes that have already ended', () => {
    // The long C4 reaches back past C2, which ended a second ago: only C4 counts.
    expect(target([pn(36, -2, 1), pn(60, -1, 5)], view())).toBeNull();
  });

  it('shows the lowest notes of a chord wider than the view', () => {
    // 8 white keys of 65 px; C2 is at x 585.
    expect(target([pn(36, 0, 1), pn(84, 0, 1)], view(8))).toBe(520);
  });

  it('stays inside the keyboard', () => {
    expect(target([pn(21, 0, 1)], view())).toBe(0);
    expect(target([pn(21, 0, 1)], view(26, 21))).toBeNull();
    expect(target([pn(108, 0, 1)], view())).toBe(520);
  });

  it('does nothing before the view has a width', () => {
    const v = new Viewport(21, 108, { whiteKeys: 26, seconds: 3 });
    expect(target([pn(84, 0, 1)], v)).toBeNull();
  });
});
