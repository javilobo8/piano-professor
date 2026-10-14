# Piano Professor

Synthesia-style piano practice in the browser. Load a MIDI file, watch the notes fall
towards an on-screen keyboard and play them on a real piano connected over USB or
Bluetooth MIDI. Built for a Roland FP-10 and an Android tablet running Chrome.

- **Wait mode**: the song stops at each note until you press the right keys.
- **Tempo mode**: the song keeps its tempo and scores your timing.
- Practise the right hand, the left hand or both; the piano (or the browser) plays the rest.
- Speed 25–150 %, A–B loop by bars, best scores per song.
- **Move through the song**: drag the progress bar at the top, or drag the falling notes up or
  down with one finger or the mouse (the notes follow the finger). The song is silent while you
  drag. It plays on when you let go, unless it was paused. With a loop on, the drag stays inside
  the loop.
- **Free play**: no song, just the keyboard: every note you play rises from its key as a bar with its name.
- **Zoom**: pinch the falling notes sideways for wider keys or up and down for more or
  fewer seconds on screen, drag sideways to look elsewhere, or use the ↔ / ↕ buttons. While zoomed
  in, Play follows the notes of the hand you practise; *Follow* brings it back after a drag.
  Each screen remembers its zoom.
- **Sound output**: the piano over MIDI, a sampled grand piano in the browser, or both
  (Settings → Sound output). With the browser on, what you play on the FP-10 (keys and
  sustain pedal) also sounds there.
- English and Spanish. Installable PWA that works offline.

## Getting started

The app is published at **<https://javilobo8.github.io/piano-professor/>**. Nothing needs to be
installed, but it can be added as an app:

- **Android (Chrome)**: menu ⋮ → **Add to home screen**. It then opens full screen.
- **Desktop (Chrome, Edge)**: the install icon at the right of the address bar.

Once loaded it also works offline. Then:

1. Connect the piano (see [Connecting the piano](#connecting-the-piano)).
2. *Add song* → pick a `.mid` file, or *Add demo song*.
3. Choose the hand, the mode and the speed → *Start*. *Listen to the song* plays it for you first.
4. No piano at hand, or want the sound from the device? Settings → *Sound output* → *Browser*
   (or *Both*). Keys played on the FP-10 still sound on the FP-10 too: turn its volume down to
   hear only the device.

## Compatibility

The piano reaches the app through two browser features:

- **Web MIDI** for a USB cable.
- **Web Bluetooth** for Bluetooth MIDI.

Neither is available everywhere. Everything else (songs, falling notes, the on-screen and PC
keyboards, the browser piano) only needs a modern browser. That part is developed and tested
in Chrome.

| Platform and browser | Piano over USB | Piano over Bluetooth |
| --- | --- | --- |
| Android: Chrome | ✅ (USB-C / OTG adapter) | ✅ |
| Windows 10/11: Chrome, Edge | ✅ | ✅ |
| macOS: Chrome, Edge | ✅ | ✅ (allow Bluetooth for the browser, see below) |
| ChromeOS: Chrome | ✅ | ✅ |
| Linux: Chrome, Brave | ✅ | ⚙️ after enabling a flag, see below |
| Firefox (desktop) | ✅ after Firefox's permission add-on prompt | ❌ |
| Safari (macOS) | ❌ | ❌ |
| iPhone / iPad (any browser) | ❌ | ❌ |

On iPhone and iPad every browser runs on Safari's engine, which has neither Web MIDI nor Web
Bluetooth. There the app can still be used without a piano: on-screen keys and browser sound.

Both features need HTTPS (or `localhost`). The published site already uses HTTPS.

What has been tested with the FP-10 so far is **Chrome 155 on Linux over Bluetooth**, with the
flag below enabled. The other rows follow each browser's documented support.

## Connecting the piano

### USB

1. Connect a cable from the FP-10's **USB to Host** port (USB-B) to the device. A tablet needs a
   USB-C / OTG adapter.
2. Accept the browser's MIDI permission prompt.

The app then connects by itself. It also reconnects when the cable is plugged back in, without
reloading. If more than one MIDI device is present, pick the piano in Settings → *MIDI device*.

### Bluetooth

1. Turn the piano on and check that its Bluetooth is on.
2. Make sure the piano is not connected to another device or app: the tablet, a phone, Roland
   Piano App. While it is, it does not show up anywhere else.
3. Settings → **Connect via Bluetooth**, pick **FP-10** in the browser's list, and confirm.

The browser asks for this tap once per session. After reopening the app, tap the button again.

**Connect only from the app.** There is no need to pair the FP-10 in the system's Bluetooth
settings, because the app talks to it directly. On Android, pairing it there first gets in the way.

Per platform:

- **Android**: the first time, Chrome asks for the *Nearby devices* permission (on Android 11 and
  older, *Location*). Allow it, and keep the tablet's Bluetooth on.
- **macOS**: System Settings → Privacy & Security → **Bluetooth** → allow Chrome (or Edge).
- **Windows**: only Bluetooth needs to be on. Nothing else to set.
- **Linux**: Web Bluetooth is off by default and needs a flag:
  - **Chrome**: open `chrome://flags/#enable-web-bluetooth` → **Enabled** → *Relaunch*.
  - **Brave**: open `brave://flags/#enable-web-bluetooth` → **Enabled** → *Relaunch*. Brave's own
    `#brave-web-bluetooth-api` flag is not enough on its own on Linux.
  - BlueZ must be running with the adapter on. `bluetoothctl show` should say `Powered: yes`.
- **Brave on Windows or macOS** (untested): if the app says Bluetooth is not available, enable
  `brave://flags/#brave-web-bluetooth-api`.

### Troubleshooting

- ***Bluetooth is not available***: there are three possible causes.
  - The browser has no Web Bluetooth: Firefox, Safari, or any browser on iPhone / iPad.
  - On Linux, the flag above is not enabled.
  - The device's Bluetooth is off.
- **The FP-10 is not in the browser's list**: it is off, its Bluetooth is off, or another
  device or app holds the connection. Disconnect that one first.
- ***Could not connect over Bluetooth***: move closer, turn the piano off and on, and try again.
- ***MIDI access is blocked***: allow *MIDI devices* for the site in the browser's site settings.
  On Android, use the app icon → App info → Permissions instead. Then reopen the app.
- ***This browser has no MIDI support***: open the app in Chrome or Edge.

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
- [ ] Dragging the progress bar with a finger moves the whole song along with it; it plays on
      when let go; a tap on the bar jumps there.
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
