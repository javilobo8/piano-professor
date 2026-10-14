/** Counts the on-screen and PC-keyboard sources holding each pitch (two fingers can hold one key). */
export class LocalNotes {
  private counts = new Map<number, number>();

  /** True when this is the first source to hold the pitch. */
  press(pitch: number): boolean {
    const count = this.counts.get(pitch) ?? 0;
    this.counts.set(pitch, count + 1);
    return count === 0;
  }

  /** True when the last source let go of the pitch. */
  release(pitch: number): boolean {
    const count = this.counts.get(pitch) ?? 0;
    if (count === 0) return false;
    if (count === 1) {
      this.counts.delete(pitch);
      return true;
    }
    this.counts.set(pitch, count - 1);
    return false;
  }

  has(pitch: number): boolean {
    return this.counts.has(pitch);
  }
}
