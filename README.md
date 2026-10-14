# Piano Professor

Synthesia-style piano practice in the browser. Load a MIDI file, watch the notes fall
towards an on-screen keyboard and play them on a real piano connected over USB or
Bluetooth MIDI. Built for a Roland FP-10 and an Android tablet running Chrome.

- **Wait mode**: the song stops at each note until you press the right keys.
- **Tempo mode**: the song keeps its tempo and scores your timing.
- Practise the right hand, the left hand or both; the piano (or the browser) plays the rest.
- Speed 25–150 %, A–B loop by bars, best scores per song.
- **Move through the song**: drag the falling notes up or down with one finger or the mouse.
  The notes follow the finger, and the song is silent while you drag. It plays on when you let
  go, unless it was paused. With a loop on, the drag stays inside the loop.
- **Free play**: no song, just the keyboard: every note you play rises from its key as a bar with its name.
- **Zoom**: pinch the falling notes sideways for wider keys or up and down for more or
  fewer seconds on screen, drag sideways to look elsewhere, or use the ↔ / ↕ buttons. While zoomed
  in, Play follows the notes of the hand you practise; *Follow* brings it back after a drag.
  Each screen remembers its zoom.
- **Sound output**: the piano over MIDI, a sampled grand piano in the browser, or both
  (Settings → Sound output). With the browser on, what you play on the FP-10 (keys and
  sustain pedal) also sounds there.
- English and Spanish. Installable PWA that works offline.

## Using it on the tablet

1. Open the published site in **Chrome for Android** (Web MIDI and Web Bluetooth need
   Chrome and HTTPS).
2. Menu ⋮ → **Add to home screen** to install it; it then opens full screen.
3. Connect the piano:
   - **USB**: cable from the FP-10 "USB to Host" port (USB-B) to the tablet (USB-C/OTG).
     Accept Chrome's MIDI permission prompt. The app connects by itself and reconnects
     when you plug the cable back in.
   - **Bluetooth**: Settings → *Connect via Bluetooth*, pick the FP-10. Chrome needs this
     tap once per session. Do not pair the FP-10 in Android's Bluetooth settings first;
     connect only from the app.
4. *Add song* → pick a `.mid` file (or add the demo song) → choose hand, mode and speed →
   *Start*.
5. No piano at hand, or want the sound from the tablet? Settings → *Sound output* →
   *Browser* (or *Both*). Keys played on the FP-10 still sound on the FP-10 too: turn its
   volume down to hear only the tablet.

## Development

```bash
npm install
npm run dev      # http://localhost:5173 (Web MIDI works on localhost)
npm test         # unit tests (Vitest)
npm run check    # type check (svelte-check + tsc)
npm run build    # production build in dist/
```

Without a piano you can play the on-screen keyboard with touch/mouse, or the PC keyboard:
`A S D F G H J K L ;` are white keys from C4, `W E T Y U O P` black keys, `Z`/`X` change
octave.

With a mouse: wheel zooms the time, Ctrl+wheel (or a trackpad pinch) zooms the keys,
Shift+wheel scrolls sideways. Dragging the notes sideways scrolls too, and dragging them up or
down moves through the song.

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`
(enable Pages → Source: *GitHub Actions* in the repository settings).

## Manual test checklist (tablet + FP-10)

- [ ] USB: badge turns green with the piano name; pressing keys lights them on screen.
- [ ] USB: unplug → badge red; plug back → green again without reloading.
- [ ] Bluetooth: *Connect via Bluetooth* lists the FP-10 and connects; keys light up.
- [ ] Wait mode, right hand: the song stops at each note and continues when played;
      a wrong key turns red and does not advance.
- [ ] The left hand and accompaniment sound on the piano when "Play the other parts" is on,
      and stop when it is off; volume changes their loudness.
- [ ] Tempo mode: hits, misses and the results screen look right; latency feels immediate.
- [ ] Speed − / + and the A–B loop work; loop passes show their score.
- [ ] Pause, seek, back and finishing never leave notes hanging on the piano.
- [ ] Dragging the notes up or down moves through the song silently and plays on from there
      when let go; a paused song stays paused; pinching during a drag zooms instead.
- [ ] Sound output *Browser*: the other parts, *Listen* and the on-screen keys sound on the
      tablet; FP-10 keys and the sustain pedal sound on the tablet as well.
- [ ] Changing the sound output in the middle of a song leaves no notes hanging on either side.
- [ ] Installed PWA opens full screen in any orientation and works in airplane mode.
- [ ] Zoom: pinching sideways and up/down on the notes zooms; while zoomed, Play keeps the
      next notes on screen; dragging stops that and *Follow* brings it back; on-screen keys
      still play the note under the finger; the zoom is still there after reopening.
- [ ] Spanish: Settings → Language → Español translates every screen.

## Credits

Browser piano samples: [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3)
by Alexander Holm, CC BY 3.0, through the MP3s published by Tone.js
(see `public/samples/piano/LICENSE.txt`; regenerate them with `scripts/fetch-piano-samples.sh`).

Icons: [Lucide](https://lucide.dev) (ISC). Font: Plus Jakarta Sans (SIL Open Font License), through Fontsource.
