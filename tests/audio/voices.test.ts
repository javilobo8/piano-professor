import { describe, expect, it } from 'vitest';
import { VoiceBook } from '../../src/audio/voices';

describe('VoiceBook', () => {
  it('releases a voice when its key goes up', () => {
    const book = new VoiceBook<string>();
    expect(book.start('app', 60, 'a')).toEqual([]);
    expect(book.release('app', 60)).toBe('a');
    expect(book.release('app', 60)).toBeNull();
  });

  it('cuts the same key of the same source when it is struck again', () => {
    const book = new VoiceBook<string>();
    book.start('app', 60, 'a');
    book.start('player', 60, 'p');
    expect(book.start('app', 60, 'b')).toEqual(['a']);
    expect(book.release('player', 60)).toBe('p');
    expect(book.release('app', 60)).toBe('b');
  });

  it('holds the player voices while the pedal is down and frees the released keys when it lifts', () => {
    const book = new VoiceBook<string>();
    book.setPedal(true);
    book.start('player', 60, 'c');
    book.start('player', 64, 'e');
    expect(book.release('player', 60)).toBeNull();
    expect(book.setPedal(false)).toEqual(['c']);
    expect(book.release('player', 64)).toBe('e');
  });

  it('the pedal never holds app voices', () => {
    const book = new VoiceBook<string>();
    book.setPedal(true);
    book.start('app', 60, 'a');
    expect(book.release('app', 60)).toBe('a');
  });

  it('releases every voice of one source, or all of them and forgets the pedal', () => {
    const book = new VoiceBook<string>();
    book.start('app', 60, 'a');
    book.start('player', 62, 'p');
    book.setPedal(true);
    expect(book.releaseAll('app')).toEqual(['a']);
    expect(book.releaseAll()).toEqual(['p']);
    book.start('player', 64, 'q');
    expect(book.release('player', 64)).toBe('q');
  });

  it('steals the oldest voice beyond the limit', () => {
    const book = new VoiceBook<string>(2);
    book.start('app', 60, 'a');
    book.start('player', 62, 'b');
    expect(book.start('app', 64, 'c')).toEqual(['a']);
    expect(book.size).toBe(2);
  });

  it('forgets a voice that ended on its own', () => {
    const book = new VoiceBook<string>();
    book.start('app', 60, 'a');
    book.ended('a');
    expect(book.size).toBe(0);
    expect(book.release('app', 60)).toBeNull();
  });
});
