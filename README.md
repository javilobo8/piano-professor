# Piano Professor

Synthesia-style piano practice in the browser. Load a MIDI file, watch the notes fall
towards an on-screen keyboard and play them on a real piano connected over USB or
Bluetooth MIDI. Built for a Roland FP-10 and an Android tablet running Chrome.

- **Wait mode**: the song stops at each note until you press the right keys.
- **Tempo mode**: the song keeps its tempo and scores your timing.
- Practise the right hand, the left hand or both; the piano plays the rest.
- Speed 25–150 %, A–B loop by bars, best scores per song.
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
- [ ] Installed PWA opens full screen in landscape and works in airplane mode.
- [ ] Spanish: Settings → Language → Español translates every screen.
