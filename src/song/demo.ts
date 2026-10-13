import { Midi } from '@tonejs/midi';

export const DEMO_FILE_NAME = 'Ode to Joy (Beethoven).mid';

const BPM = 100;

// [pitch, beats]
const MELODY: Array<[number, number]> = [
  [64, 1], [64, 1], [65, 1], [67, 1],
  [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1],
  [64, 1.5], [62, 0.5], [62, 2],
  [64, 1], [64, 1], [65, 1], [67, 1],
  [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1],
  [62, 1.5], [60, 0.5], [60, 2],
];

const BASS: Array<[number, number]> = [
  [48, 4], [43, 4], [48, 4], [43, 4],
  [48, 4], [43, 4], [48, 4], [43, 2], [48, 2],
];

/** Two-hand "Ode to Joy" in C, 4/4 at 100 bpm, as MIDI bytes. */
export function buildDemoMidi(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(BPM);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.update();
  addTrack(midi, 'Right hand', 0, MELODY);
  addTrack(midi, 'Left hand', 1, BASS);
  return midi.toArray();
}

function addTrack(midi: Midi, name: string, channel: number, notes: Array<[number, number]>): void {
  const beat = 60 / BPM;
  const track = midi.addTrack();
  track.name = name;
  track.channel = channel;
  let beats = 0;
  for (const [pitch, length] of notes) {
    track.addNote({ midi: pitch, time: beats * beat, duration: length * beat * 0.95, velocity: 0.75 });
    beats += length;
  }
}
