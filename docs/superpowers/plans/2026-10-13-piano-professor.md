# Piano Professor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Synthesia-style practice web app (installable PWA) for an Android tablet with a Roland FP-10 over USB or Bluetooth MIDI: falling notes, wait and tempo modes, hand selection, speed, A–B loop, saved library and scores, English and Spanish.

**Architecture:** 100 % client-side. Pure TypeScript modules (`song`, `engine`, `midi-io` byte handling, `render` layout, `i18n`, `storage`) are unit-tested with Vitest in Node; thin browser adapters (Web MIDI, Web Bluetooth, IndexedDB, Canvas) sit around them; Svelte 5 screens orchestrate. Notes the player does not play are sent to the piano as MIDI; the tablet makes no sound.

**Tech Stack:** Vite 8, Svelte 5, TypeScript 6, Vitest 5, `@tonejs/midi`, `idb`, `vite-plugin-pwa`, `fake-indexeddb` (tests), Canvas 2D, Web MIDI API, Web Bluetooth.

**Spec:** `docs/superpowers/specs/2026-10-13-piano-professor-design.md`

**About the code in this plan:** every file below was written and verified in a throwaway prototype before this plan was saved (111 tests passing, `svelte-check` 0 errors/0 warnings, production build OK, and a manual browser run of library → setup → wait mode → tempo mode → results → settings in Spanish). Copy files exactly; if something fails, fix the root cause and note the deviation in your report.

## Global Constraints

- Node 26 / npm 11 locally; CI uses Node 24. TypeScript stays `~6.0` (svelte-check 4 does not support TypeScript 7).
- Dependency ranges exactly as in Task 1's `package.json`; no other runtime dependencies.
- Target browser: Chrome on Android (Web MIDI, Web Bluetooth, Wake Lock). iPad/Safari is out of scope.
- No audio from the tablet: notes the player does not play go to the piano over MIDI (channel 1, note on/off only, never pedal messages).
- `allNotesOff` is sent on pause, seek, loop restart, finish and leaving the play screen.
- Time units: song time in seconds (`songTime`, `start`, `end`); wall-clock time in milliseconds from `performance.now()` (`nowMs`, `timeMs`).
- Every user-visible string comes from `src/i18n` (`en` is the default language, `es` must have the same keys and placeholders).
- No browser dialogs (`alert`, `confirm`, `prompt`).
- `localStorage` access is always wrapped in try/catch; songs and scores live in IndexedDB.
- Vite `base: './'` so the build works under any GitHub Pages path.
- Each task ends with `npm test` and `npm run check` green and one commit whose message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Piano unplugged mid-song → the badge turns red, playback keeps running on screen, and plugging back in reconnects without reloading (pinned in Task 7: "notices unplug and replug").
- Leaving, pausing, seeking or finishing must never leave notes hanging on the piano (pinned in Task 5: pause/seek/finish emit `allNotesOff`; Task 6: `allNotesOff` releases every sounding note before CC 123).
- MIDI events reach JavaScript after the animation frame that should judge them → they must be judged at their own timestamp (pinned in Task 5: "judges a press by its own timestamp even if it arrives after the frame").
- A file that is not MIDI, or a MIDI with only drums → a readable error, never a crash or an empty song in the library (pinned in Task 2: invalid / empty `SongParseError`).
- Corrupt or old `localStorage` settings → defaults instead of a broken app (pinned in Task 9: "ignores invalid values and corrupt data").

## File Map

| Path | Responsibility |
|------|----------------|
| `src/util/bisect.ts` | Binary search over items sorted by `start` |
| `src/song/*` | MIDI → `Song`, hand roles, chord steps, demo song |
| `src/engine/*` | Practice session (clock, wait/tempo judging, loop, auto-play output) |
| `src/midi-io/*` | MIDI bytes, BLE-MIDI packets, USB/Bluetooth connections, connection manager |
| `src/render/*` | Keyboard layout and Canvas drawing |
| `src/i18n/*` | English/Spanish strings, note names |
| `src/storage/*` | Settings (localStorage), songs and scores (IndexedDB) |
| `src/ui/*.ts` | Stores, router state, play controller, previewer, helpers |
| `src/ui/components/*`, `src/ui/screens/*`, `src/ui/App.svelte` | Svelte screens |
| `tests/**` | Vitest unit tests mirroring `src/` |

## Task Order and Parallelism

Task 1 → 2 → 3 → 4, then two independent lanes: **A** = 5 → 7 (needs 6) and **B** = 6 → 8 → 9 → 10. Task 11 needs 1–10; 12 needs 11; 13 can run any time after 1.
Run at most two implementers at once and never let two of them commit at the same time (stage only your own files).

---

### Task 1: Project scaffold, PWA config and shared search helper

Create the Vite + Svelte 5 + TypeScript project in the existing repository root (it already holds `docs/` and `.git`). Do not run `npm create vite` — write the files below exactly. The PWA manifest and icons are part of the scaffold. `src/ui/App.svelte` is a placeholder that Task 12 replaces.

**Files:**
- Create: `package.json`, `.gitignore`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `svelte.config.js`, `vite.config.ts`, `index.html`
- Create: `public/icon.svg`, `public/icon-maskable.svg` (+ generated `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`)
- Create: `src/app.css`, `src/main.ts`, `src/ui/App.svelte` (placeholder)
- Create: `src/util/bisect.ts`
- Test: `tests/util/bisect.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `lowerBound(items: readonly { start: number }[], value: number): number` in `src/util/bisect.ts`; npm scripts `dev`, `build`, `test`, `check`; global CSS variables in `src/app.css` (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-dim`, `--accent`, `--accent-text`, `--right`, `--left`, `--danger`, `--ok`, `--radius`, `--tap`) and classes `.screen`, `.screen-header`, `.card`, `.error`, `.dim`, `button.primary|ghost|danger`.

- [ ] **Step 1: Write the project configuration files**

`package.json`:

```json
{
  "name": "piano-professor",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "check": "svelte-check --tsconfig ./tsconfig.app.json && tsc -p tsconfig.node.json"
  },
  "dependencies": {
    "@tonejs/midi": "^2.0.28",
    "idb": "^8.0.4"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^7.3.0",
    "@tsconfig/svelte": "^5.0.8",
    "@types/node": "^24.13.3",
    "@types/web-bluetooth": "^0.0.21",
    "fake-indexeddb": "^6.2.5",
    "svelte": "^5.57.0",
    "svelte-check": "^4.7.6",
    "typescript": "~6.0.2",
    "vite": "^8.3.0",
    "vite-plugin-pwa": "^2.0.0",
    "vitest": "^5.0.4"
  }
}
```

`.gitignore`:

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`:

```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "module": "esnext",
    "types": ["svelte", "vite/client", "web-bluetooth"],
    "allowArbitraryExtensions": true,
    "noEmit": true,
    /**
     * Typecheck JS in `.svelte` and `.js` files by default.
     * Disable checkJs if you'd like to use dynamic types in JS.
     * Note that setting allowJs false does not prevent the use
     * of JS in `.svelte` files.
     */
    "allowJs": true,
    "checkJs": true,
    "moduleDetection": "force"
  },
  "include": ["src/**/*.ts", "src/**/*.js", "src/**/*.svelte", "tests/**/*.ts"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,

    /* Bundler mode */
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
```

`svelte.config.js`:

```js
/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {}
```

`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the build works at any path (e.g. GitHub Pages /piano-professor/).
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Piano Professor',
        short_name: 'Piano Prof',
        description: 'Practise piano with falling notes and a MIDI keyboard.',
        start_url: '.',
        scope: '.',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#12141a',
        theme_color: '#12141a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#12141a" />
    <meta name="description" content="Practise piano with falling notes and a MIDI keyboard." />
    <link rel="icon" type="image/svg+xml" href="./icon.svg" />
    <link rel="apple-touch-icon" href="./apple-touch-icon.png" />
    <title>Piano Professor</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the icons and render the PNG sizes**

`public/icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#12141a"/>
  <rect x="96" y="150" width="56" height="150" rx="10" fill="#4cc36a"/>
  <rect x="236" y="100" width="56" height="200" rx="10" fill="#3d8bfd"/>
  <rect x="340" y="190" width="56" height="110" rx="10" fill="#4cc36a"/>
  <rect x="64" y="312" width="384" height="8" rx="4" fill="#e8c35a"/>
  <g fill="#f4f4f5">
    <rect x="64" y="328" width="72" height="120" rx="8"/>
    <rect x="142" y="328" width="72" height="120" rx="8"/>
    <rect x="220" y="328" width="72" height="120" rx="8"/>
    <rect x="298" y="328" width="72" height="120" rx="8"/>
    <rect x="376" y="328" width="72" height="120" rx="8"/>
  </g>
  <g fill="#1c1c22">
    <rect x="116" y="328" width="44" height="72" rx="6"/>
    <rect x="194" y="328" width="44" height="72" rx="6"/>
    <rect x="350" y="328" width="44" height="72" rx="6"/>
  </g>
</svg>
```

`public/icon-maskable.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#12141a"/>
  <g transform="translate(51.2 51.2) scale(0.8)">
    <rect x="96" y="150" width="56" height="150" rx="10" fill="#4cc36a"/>
    <rect x="236" y="100" width="56" height="200" rx="10" fill="#3d8bfd"/>
    <rect x="340" y="190" width="56" height="110" rx="10" fill="#4cc36a"/>
    <rect x="64" y="312" width="384" height="8" rx="4" fill="#e8c35a"/>
    <g fill="#f4f4f5">
      <rect x="64" y="328" width="72" height="120" rx="8"/>
      <rect x="142" y="328" width="72" height="120" rx="8"/>
      <rect x="220" y="328" width="72" height="120" rx="8"/>
      <rect x="298" y="328" width="72" height="120" rx="8"/>
      <rect x="376" y="328" width="72" height="120" rx="8"/>
    </g>
    <g fill="#1c1c22">
      <rect x="116" y="328" width="44" height="72" rx="6"/>
      <rect x="194" y="328" width="44" height="72" rx="6"/>
      <rect x="350" y="328" width="44" height="72" rx="6"/>
    </g>
  </g>
</svg>
```

Then render the PNGs (`rsvg-convert` is installed on this machine):

```bash
rsvg-convert -w 192 -h 192 public/icon.svg -o public/icon-192.png
rsvg-convert -w 512 -h 512 public/icon.svg -o public/icon-512.png
rsvg-convert -w 512 -h 512 public/icon-maskable.svg -o public/icon-maskable-512.png
rsvg-convert -w 180 -h 180 public/icon-maskable.svg -o public/apple-touch-icon.png
```

- [ ] **Step 3: Write the global styles, entry point and placeholder app**

`src/app.css`:

```css
:root {
  --bg: #12141a;
  --surface: #1b1e27;
  --surface-2: #252935;
  --border: #323746;
  --text: #eef0f4;
  --text-dim: #9aa1b2;
  --accent: #e8c35a;
  --accent-text: #1b1606;
  --right: #4cc36a;
  --left: #3d8bfd;
  --danger: #ef4444;
  --ok: #4cc36a;
  --radius: 12px;
  --tap: 48px;
  color-scheme: dark;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  background: var(--bg);
  -webkit-tap-highlight-color: transparent;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  overscroll-behavior: none;
}

#app {
  height: 100%;
}

button,
select,
input {
  font: inherit;
  color: inherit;
}

button {
  min-height: var(--tap);
  padding: 0 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  cursor: pointer;
  touch-action: manipulation;
}

button:disabled {
  opacity: 0.45;
  cursor: default;
}

button.primary {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
  font-weight: 700;
}

button.ghost {
  background: transparent;
}

button.danger {
  border-color: var(--danger);
  color: var(--danger);
}

select {
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

input[type='text'] {
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

input[type='range'] {
  accent-color: var(--accent);
  width: 100%;
}

input[type='checkbox'] {
  accent-color: var(--accent);
  width: 22px;
  height: 22px;
}

.screen {
  height: 100%;
  overflow-y: auto;
  padding: 16px max(16px, env(safe-area-inset-right)) 32px max(16px, env(safe-area-inset-left));
}

.screen-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.screen-header h1 {
  flex: 1;
  margin: 0;
  font-size: 1.5rem;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}

.error {
  color: var(--danger);
}

.dim {
  color: var(--text-dim);
}
```

`src/main.ts`:

```ts
import { mount } from 'svelte';
import './app.css';
import App from './ui/App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;
```

`src/ui/App.svelte`:

```svelte
<main class="screen">
  <h1>Piano Professor</h1>
</main>
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: installs without peer-dependency errors and writes `package-lock.json`. TypeScript must stay on 6.x (`svelte-check` does not support 7).
- [ ] **Step 5: Write the failing tests**

`tests/util/bisect.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lowerBound } from '../../src/util/bisect';

describe('lowerBound', () => {
  const items = [0, 1, 1, 2, 5].map((start) => ({ start }));

  it('returns the first index whose start is >= value', () => {
    expect(lowerBound(items, -1)).toBe(0);
    expect(lowerBound(items, 1)).toBe(1);
    expect(lowerBound(items, 1.5)).toBe(3);
    expect(lowerBound(items, 5)).toBe(4);
    expect(lowerBound(items, 6)).toBe(5);
  });

  it('handles an empty list', () => {
    expect(lowerBound([], 3)).toBe(0);
  });
});
```

- [ ] **Step 6: Run the tests to see them fail**

```bash
npx vitest run tests/util/bisect.test.ts
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 7: Write the implementation**

`src/util/bisect.ts`:

```ts
/** Index of the first item whose `start` is >= `value` (items sorted by `start`). */
export function lowerBound(items: readonly { start: number }[], value: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid].start < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
```

- [ ] **Step 8: Run the tests to see them pass**

```bash
npx vitest run tests/util/bisect.test.ts
```

Expected: PASS, every test green.

- [ ] **Step 9: Run the full check and build**

```bash
npm run check && npm run build
```

Expected: `svelte-check` reports 0 errors and 0 warnings; the build prints `PWA v2.0.0` and generates `dist/sw.js` and `dist/manifest.webmanifest`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore tsconfig.json tsconfig.app.json tsconfig.node.json svelte.config.js vite.config.ts index.html public src tests
git commit -m "chore: scaffold Vite + Svelte + TypeScript PWA" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Parse MIDI files into songs

Turn MIDI bytes into a `Song`: notes in seconds sorted by start, playable tracks, and measure boundaries. `@tonejs/midi` already splits every file track into one track per (channel, program), so a one-track file using two channels arrives as two tracks.

**Files:**
- Create: `src/song/types.ts`
- Create: `src/song/parse.ts`
- Test: `tests/helpers/make-midi.ts`
- Test: `tests/song/parse.test.ts`

**Interfaces:**
- Consumes: Task 1 scaffold (npm scripts, `@tonejs/midi` installed).
- Produces: In `src/song/types.ts`: `Role`, `PlayRole`, `SongNote`, `TrackInfo`, `Song`, `HandConfig`, `PlayableNote`. In `src/song/parse.ts`: `PIANO_LOW = 21`, `PIANO_HIGH = 108`, `class SongParseError { code: 'invalid' | 'empty' }`, `titleFromFileName(fileName: string): string`, `parseSong(bytes: ArrayBuffer | Uint8Array, fileName: string): Song`. Test helpers in `tests/helpers/make-midi.ts`: `makeMidi(tracks: TrackSpec[], opts?: { bpm?: number; timeSignature?: [number, number] }): Uint8Array` and `pn(pitch, start, duration, role = 'right'): PlayableNote`.

- [ ] **Step 1: Write the failing tests**

`tests/helpers/make-midi.ts`:

```ts
import { Midi } from '@tonejs/midi';
import type { PlayableNote, PlayRole } from '../../src/song/types';

export interface TrackSpec {
  name?: string;
  channel?: number;
  /** [pitch, startSeconds, durationSeconds] */
  notes: Array<[number, number, number]>;
}

/** Builds a MIDI file in memory. Default tempo is 120 bpm (one beat = 0.5 s). */
export function makeMidi(
  tracks: TrackSpec[],
  opts: { bpm?: number; timeSignature?: [number, number] } = {},
): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(opts.bpm ?? 120);
  if (opts.timeSignature) {
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: opts.timeSignature });
  }
  midi.header.update();
  for (const spec of tracks) {
    const track = midi.addTrack();
    if (spec.name) track.name = spec.name;
    track.channel = spec.channel ?? 0;
    for (const [pitch, time, duration] of spec.notes) {
      track.addNote({ midi: pitch, time, duration, velocity: 0.8 });
    }
  }
  return midi.toArray();
}

let nextId = 0;

/** Shorthand for engine tests. */
export function pn(pitch: number, start: number, duration: number, role: PlayRole = 'right'): PlayableNote {
  return { id: nextId++, pitch, start, end: start + duration, velocity: 0.8, track: 0, role };
}
```

`tests/song/parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SongParseError, parseSong, titleFromFileName } from '../../src/song/parse';
import { makeMidi } from '../helpers/make-midi';

describe('parseSong', () => {
  it('reads notes in seconds, sorted by start then pitch', () => {
    const bytes = makeMidi([
      { name: 'RH', notes: [[67, 1, 0.5], [64, 0, 0.5]] },
      { name: 'LH', channel: 1, notes: [[48, 0, 1]] },
    ]);
    const song = parseSong(bytes, 'song.mid');
    expect(song.notes.map((n) => [n.pitch, n.start, n.end, n.track])).toEqual([
      [48, 0, 1, 1],
      [64, 0, 0.5, 0],
      [67, 1, 1.5, 0],
    ]);
    expect(song.notes.map((n) => n.id)).toEqual([0, 1, 2]);
    expect(song.duration).toBe(1.5);
  });

  it('describes each track', () => {
    const bytes = makeMidi([
      { name: ' RH ', notes: [[60, 0, 1], [64, 1, 1]] },
      { name: 'LH', channel: 1, notes: [[48, 0, 1]] },
    ]);
    const song = parseSong(bytes, 'song.mid');
    expect(song.tracks).toEqual([
      { index: 0, name: 'RH', channel: 0, noteCount: 2, avgPitch: 62 },
      { index: 1, name: 'LH', channel: 1, noteCount: 1, avgPitch: 48 },
    ]);
  });

  it('drops percussion tracks and notes outside the piano range', () => {
    const bytes = makeMidi([
      { name: 'Drums', channel: 9, notes: [[36, 0, 0.5]] },
      { name: 'Piano', notes: [[60, 0, 0.5], [12, 0, 0.5], [120, 0, 0.5]] },
    ]);
    const song = parseSong(bytes, 'song.mid');
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0].name).toBe('Piano');
    expect(song.notes.map((n) => n.pitch)).toEqual([60]);
    expect(song.notes[0].track).toBe(0);
  });

  it('computes 4/4 measures at 120 bpm (2 s each) covering the whole song', () => {
    const song = parseSong(makeMidi([{ notes: [[60, 0, 5]] }]), 'a.mid');
    expect(song.measures).toEqual([0, 2, 4, 6]);
  });

  it('computes 3/4 measures (1.5 s each)', () => {
    const song = parseSong(makeMidi([{ notes: [[60, 0, 3]] }], { timeSignature: [3, 4] }), 'a.mid');
    expect(song.measures).toEqual([0, 1.5, 3]);
  });

  it('always returns at least two measure boundaries', () => {
    const song = parseSong(makeMidi([{ notes: [[60, 0, 0]] }]), 'a.mid');
    expect(song.measures).toEqual([0, 2]);
  });

  it('uses the file name as title', () => {
    expect(parseSong(makeMidi([{ notes: [[60, 0, 1]] }]), 'Für Elise.MIDI').title).toBe('Für Elise');
  });

  it('rejects bytes that are not MIDI', () => {
    expect(() => parseSong(new Uint8Array([1, 2, 3, 4]), 'x.mid')).toThrowError(SongParseError);
    try {
      parseSong(new Uint8Array([1, 2, 3, 4]), 'x.mid');
    } catch (e) {
      expect((e as SongParseError).code).toBe('invalid');
    }
  });

  it('rejects MIDI files without playable notes', () => {
    const bytes = makeMidi([{ channel: 9, notes: [[36, 0, 1]] }]);
    try {
      parseSong(bytes, 'x.mid');
      expect.unreachable();
    } catch (e) {
      expect((e as SongParseError).code).toBe('empty');
    }
  });
});

describe('titleFromFileName', () => {
  it('strips .mid/.midi and falls back to Untitled', () => {
    expect(titleFromFileName('a.mid')).toBe('a');
    expect(titleFromFileName('b.midi')).toBe('b');
    expect(titleFromFileName('.mid')).toBe('Untitled');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/song/parse.test.ts
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/song/types.ts`:

```ts
export type Role = 'right' | 'left' | 'accompaniment' | 'ignore';
export type PlayRole = Exclude<Role, 'ignore'>;

export interface SongNote {
  /** Index of the note in `Song.notes`. */
  id: number;
  /** MIDI pitch, 21 (A0) to 108 (C8). */
  pitch: number;
  /** Start in song seconds. */
  start: number;
  /** End in song seconds (>= start). */
  end: number;
  /** 0–1. */
  velocity: number;
  /** Index into `Song.tracks`. */
  track: number;
}

export interface TrackInfo {
  index: number;
  name: string;
  channel: number;
  noteCount: number;
  avgPitch: number;
}

export interface Song {
  title: string;
  /** End of the last note, in seconds. */
  duration: number;
  /** Sorted by start, then pitch. */
  notes: SongNote[];
  /** Only tracks with playable notes, indexed 0..n-1. */
  tracks: TrackInfo[];
  /**
   * Measure boundaries in seconds: measures[0] = 0, measure i spans
   * [measures[i], measures[i + 1]), and the last value is >= duration.
   * Always has at least 2 entries.
   */
  measures: number[];
}

export interface HandConfig {
  method: 'tracks' | 'split';
  /** Used when method is 'tracks'. Missing tracks count as accompaniment. */
  trackRoles: Record<number, Role>;
  /** Used when method is 'split': pitch >= splitPitch is right hand. */
  splitPitch: number;
}

export interface PlayableNote extends SongNote {
  role: PlayRole;
}
```

`src/song/parse.ts`:

```ts
import { Midi, type Header } from '@tonejs/midi';
import type { Song, SongNote, TrackInfo } from './types';

export const PIANO_LOW = 21;
export const PIANO_HIGH = 108;
const PERCUSSION_CHANNEL = 9;
const MAX_MEASURES = 10_000;

export class SongParseError extends Error {
  constructor(readonly code: 'invalid' | 'empty') {
    super(code === 'invalid' ? 'Not a valid MIDI file' : 'MIDI file has no playable notes');
    this.name = 'SongParseError';
  }
}

export function titleFromFileName(fileName: string): string {
  const title = fileName.replace(/\.(mid|midi)$/i, '').trim();
  return title || 'Untitled';
}

export function parseSong(bytes: ArrayBuffer | Uint8Array, fileName: string): Song {
  let midi: Midi;
  try {
    midi = new Midi(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch {
    throw new SongParseError('invalid');
  }

  const tracks: TrackInfo[] = [];
  const raw: Omit<SongNote, 'id'>[] = [];
  for (const track of midi.tracks) {
    if (track.channel === PERCUSSION_CHANNEL) continue;
    const playable = track.notes.filter((n) => n.midi >= PIANO_LOW && n.midi <= PIANO_HIGH);
    if (playable.length === 0) continue;
    const index = tracks.length;
    let pitchSum = 0;
    for (const n of playable) {
      pitchSum += n.midi;
      raw.push({
        pitch: n.midi,
        start: n.time,
        end: n.time + Math.max(0, n.duration),
        velocity: n.velocity,
        track: index,
      });
    }
    tracks.push({
      index,
      name: track.name.trim(),
      channel: track.channel,
      noteCount: playable.length,
      avgPitch: pitchSum / playable.length,
    });
  }
  if (raw.length === 0) throw new SongParseError('empty');

  raw.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const notes: SongNote[] = raw.map((n, id) => ({ ...n, id }));
  const duration = notes.reduce((max, n) => Math.max(max, n.end), 0);
  return {
    title: titleFromFileName(fileName),
    duration,
    notes,
    tracks,
    measures: computeMeasures(midi.header, duration),
  };
}

function computeMeasures(header: Header, duration: number): number[] {
  const sigs = [...header.timeSignatures]
    .filter((s) => s.timeSignature[0] > 0 && s.timeSignature[1] > 0)
    .sort((a, b) => a.ticks - b.ticks);
  if (sigs.length === 0 || sigs[0].ticks > 0) sigs.unshift({ ticks: 0, timeSignature: [4, 4] });

  const endTicks = header.secondsToTicks(duration);
  const measures: number[] = [];
  let tick = 0;
  let sig = 0;
  for (;;) {
    while (sig + 1 < sigs.length && sigs[sig + 1].ticks <= tick) sig++;
    measures.push(header.ticksToSeconds(tick));
    if ((tick >= endTicks && measures.length >= 2) || measures.length > MAX_MEASURES) break;
    const [num, den] = sigs[sig].timeSignature;
    let next = tick + (header.ppq * 4 * num) / den;
    if (sig + 1 < sigs.length && sigs[sig + 1].ticks < next) next = sigs[sig + 1].ticks;
    tick = next;
  }
  return measures;
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/song/parse.test.ts
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/song/types.ts src/song/parse.ts tests/helpers/make-midi.ts tests/song/parse.test.ts
git commit -m "feat(song): parse MIDI files into songs with measures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Hand assignment, chord steps and demo song

Guess which track is each hand, give every note its role, group chords into steps for wait mode, and build the bundled two-hand "Ode to Joy" demo.

**Files:**
- Create: `src/song/hands.ts`
- Create: `src/song/steps.ts`
- Create: `src/song/demo.ts`
- Test: `tests/song/hands.test.ts`
- Test: `tests/song/steps-demo.test.ts`

**Interfaces:**
- Consumes: From Task 2: `Song`, `HandConfig`, `PlayableNote`, `Role`, `TrackInfo` (`src/song/types.ts`); `parseSong` (`src/song/parse.ts`); test helpers `makeMidi`, `pn`.
- Produces: `DEFAULT_SPLIT_PITCH = 60`, `autoHandConfig(song: Song): HandConfig`, `applyHandConfig(song: Song, config: HandConfig): PlayableNote[]` in `src/song/hands.ts`; `CHORD_TOLERANCE = 0.03`, `interface Step { time: number; notes: PlayableNote[] }`, `buildSteps(notes: readonly PlayableNote[]): Step[]` in `src/song/steps.ts`; `DEMO_FILE_NAME`, `buildDemoMidi(): Uint8Array` in `src/song/demo.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/song/hands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyHandConfig, autoHandConfig } from '../../src/song/hands';
import { parseSong } from '../../src/song/parse';
import { makeMidi } from '../helpers/make-midi';

describe('autoHandConfig', () => {
  it('uses track names when both hands are named', () => {
    const song = parseSong(
      makeMidi([
        { name: 'Piano LH', notes: [[72, 0, 1]] },
        { name: 'Piano RH', channel: 1, notes: [[40, 0, 1]] },
      ]),
      'a.mid',
    );
    expect(autoHandConfig(song)).toEqual({
      method: 'tracks',
      trackRoles: { 0: 'left', 1: 'right' },
      splitPitch: 60,
    });
  });

  it('recognises Spanish names', () => {
    const song = parseSong(
      makeMidi([
        { name: 'Mano derecha', notes: [[40, 0, 1]] },
        { name: 'Mano izquierda', channel: 1, notes: [[72, 0, 1]] },
      ]),
      'a.mid',
    );
    expect(autoHandConfig(song).trackRoles).toEqual({ 0: 'right', 1: 'left' });
  });

  it('falls back to average pitch of the two busiest tracks; others are accompaniment', () => {
    const song = parseSong(
      makeMidi([
        { name: 'Strings', notes: [[50, 0, 1]] },
        { name: 'Piano 1', channel: 1, notes: [[45, 0, 1], [47, 1, 1], [48, 2, 1]] },
        { name: 'Piano 2', channel: 2, notes: [[70, 0, 1], [72, 1, 1]] },
      ]),
      'a.mid',
    );
    expect(autoHandConfig(song).trackRoles).toEqual({ 0: 'accompaniment', 1: 'left', 2: 'right' });
  });

  it('splits by pitch when there is a single track', () => {
    const song = parseSong(makeMidi([{ notes: [[60, 0, 1], [48, 0, 1]] }]), 'a.mid');
    expect(autoHandConfig(song)).toEqual({ method: 'split', trackRoles: {}, splitPitch: 60 });
  });
});

describe('applyHandConfig', () => {
  const song = parseSong(
    makeMidi([
      { name: 'A', notes: [[72, 0, 1]] },
      { name: 'B', channel: 1, notes: [[48, 0.5, 1]] },
      { name: 'C', channel: 2, notes: [[60, 1, 1]] },
    ]),
    'a.mid',
  );

  it('assigns roles by track and drops ignored tracks', () => {
    const notes = applyHandConfig(song, {
      method: 'tracks',
      trackRoles: { 0: 'right', 1: 'ignore', 2: 'accompaniment' },
      splitPitch: 60,
    });
    expect(notes.map((n) => [n.pitch, n.role])).toEqual([
      [72, 'right'],
      [60, 'accompaniment'],
    ]);
  });

  it('treats tracks without a role as accompaniment', () => {
    const notes = applyHandConfig(song, { method: 'tracks', trackRoles: { 0: 'right' }, splitPitch: 60 });
    expect(notes.map((n) => n.role)).toEqual(['right', 'accompaniment', 'accompaniment']);
  });

  it('splits by pitch: >= splitPitch is right hand', () => {
    const notes = applyHandConfig(song, { method: 'split', trackRoles: {}, splitPitch: 60 });
    expect(notes.map((n) => [n.pitch, n.role])).toEqual([
      [72, 'right'],
      [48, 'left'],
      [60, 'right'],
    ]);
  });
});
```

`tests/song/steps-demo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDemoMidi } from '../../src/song/demo';
import { autoHandConfig } from '../../src/song/hands';
import { parseSong } from '../../src/song/parse';
import { buildSteps } from '../../src/song/steps';
import { pn } from '../helpers/make-midi';

describe('buildSteps', () => {
  it('groups notes starting within 30 ms into one step', () => {
    const steps = buildSteps([pn(60, 0, 1), pn(64, 0.02, 1), pn(67, 0.5, 1), pn(72, 0.55, 1)]);
    expect(steps.map((s) => [s.time, s.notes.map((n) => n.pitch)])).toEqual([
      [0, [60, 64]],
      [0.5, [67]],
      [0.55, [72]],
    ]);
  });

  it('returns no steps for no notes', () => {
    expect(buildSteps([])).toEqual([]);
  });
});

describe('demo song', () => {
  it('parses into two named hands, 8 bars of 4/4 at 100 bpm', () => {
    const song = parseSong(buildDemoMidi(), 'Ode to Joy (Beethoven).mid');
    expect(song.title).toBe('Ode to Joy (Beethoven)');
    expect(song.tracks.map((t) => t.name)).toEqual(['Right hand', 'Left hand']);
    expect(autoHandConfig(song).trackRoles).toEqual({ 0: 'right', 1: 'left' });
    expect(song.measures).toHaveLength(9);
    expect(song.measures[1]).toBeCloseTo(2.4);
    expect(song.notes.filter((n) => n.track === 0)).toHaveLength(30);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/song
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/song/hands.ts`:

```ts
import type { HandConfig, PlayableNote, Role, Song, TrackInfo } from './types';

export const DEFAULT_SPLIT_PITCH = 60;

const RIGHT_NAME = /right|\brh\b|derech|treble/i;
const LEFT_NAME = /left|\blh\b|izquierd|bass/i;

/** Guesses which track (or pitch range) belongs to each hand. */
export function autoHandConfig(song: Song): HandConfig {
  if (song.tracks.length < 2) {
    return { method: 'split', trackRoles: {}, splitPitch: DEFAULT_SPLIT_PITCH };
  }

  const namedRight = song.tracks.find((t) => RIGHT_NAME.test(t.name));
  const namedLeft = song.tracks.find((t) => LEFT_NAME.test(t.name) && !RIGHT_NAME.test(t.name));
  let right: TrackInfo;
  let left: TrackInfo;
  if (namedRight && namedLeft) {
    right = namedRight;
    left = namedLeft;
  } else {
    const [a, b] = [...song.tracks].sort((x, y) => y.noteCount - x.noteCount || x.index - y.index);
    [right, left] = a.avgPitch >= b.avgPitch ? [a, b] : [b, a];
  }

  const trackRoles: Record<number, Role> = {};
  for (const t of song.tracks) {
    trackRoles[t.index] = t === right ? 'right' : t === left ? 'left' : 'accompaniment';
  }
  return { method: 'tracks', trackRoles, splitPitch: DEFAULT_SPLIT_PITCH };
}

/** Gives every note its role; notes whose track is ignored are dropped. */
export function applyHandConfig(song: Song, config: HandConfig): PlayableNote[] {
  const out: PlayableNote[] = [];
  for (const n of song.notes) {
    const role: Role =
      config.method === 'split'
        ? n.pitch >= config.splitPitch
          ? 'right'
          : 'left'
        : (config.trackRoles[n.track] ?? 'accompaniment');
    if (role !== 'ignore') out.push({ ...n, role });
  }
  return out;
}
```

`src/song/steps.ts`:

```ts
import type { PlayableNote } from './types';

/** Notes starting within this many song seconds of each other form one step (a chord). */
export const CHORD_TOLERANCE = 0.03;

export interface Step {
  /** Start of the first note in the step. */
  time: number;
  notes: PlayableNote[];
}

/** Groups notes (sorted by start) into steps. */
export function buildSteps(notes: readonly PlayableNote[]): Step[] {
  const steps: Step[] = [];
  for (const n of notes) {
    const last = steps[steps.length - 1];
    if (last && n.start - last.time <= CHORD_TOLERANCE) last.notes.push(n);
    else steps.push({ time: n.start, notes: [n] });
  }
  return steps;
}
```

`src/song/demo.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/song
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/song/hands.ts src/song/steps.ts src/song/demo.ts tests/song/hands.test.ts tests/song/steps-demo.test.ts
git commit -m "feat(song): assign hands, group chords into steps, add demo song" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Engine types, scoring and automatic playback

Shared engine types, score percentages, and the `AutoPlayer` that turns the notes nobody has to play into noteOn/noteOff events as song time passes (overlapping notes of the same pitch are retriggered and only released at the last end).

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/scoring.ts`
- Create: `src/engine/auto-player.ts`
- Test: `tests/engine/scoring.test.ts`
- Test: `tests/engine/auto-player.test.ts`

**Interfaces:**
- Consumes: `PlayableNote` (Task 2), `lowerBound` (Task 1), test helper `pn` (Task 2).
- Produces: In `src/engine/types.ts`: `Mode`, `Practice`, `LoopRange`, `SessionConfig`, `OutputEvent`, `Status`, `KeyResult`, `WaitScore`, `TempoScore`, `Score`, `SessionState`. In `src/engine/scoring.ts`: `emptyWaitScore(totalSteps)`, `emptyTempoScore()`, `scorePercent(score: Score): number`. In `src/engine/auto-player.ts`: `class AutoPlayer { constructor(notes); reset(t); silence(); advanceTo(t, volume, emit) }`.

- [ ] **Step 1: Write the failing tests**

`tests/engine/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyTempoScore, emptyWaitScore, scorePercent } from '../../src/engine/scoring';

describe('scorePercent', () => {
  it('is clean steps over total steps in wait mode', () => {
    expect(scorePercent({ ...emptyWaitScore(8), cleanSteps: 6 })).toBe(75);
    expect(scorePercent(emptyWaitScore(0))).toBe(0);
  });

  it('is hits over hits + misses + extras in tempo mode', () => {
    expect(scorePercent({ ...emptyTempoScore(), hits: 6, misses: 1, extras: 1 })).toBe(75);
    expect(scorePercent(emptyTempoScore())).toBe(0);
  });

  it('rounds to a whole number', () => {
    expect(scorePercent({ ...emptyWaitScore(3), cleanSteps: 2 })).toBe(67);
  });
});
```

`tests/engine/auto-player.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AutoPlayer } from '../../src/engine/auto-player';
import type { OutputEvent } from '../../src/engine/types';
import { pn } from '../helpers/make-midi';

function run(player: AutoPlayer, t: number, volume = 1): OutputEvent[] {
  const events: OutputEvent[] = [];
  player.advanceTo(t, volume, (e) => events.push(e));
  return events;
}

describe('AutoPlayer', () => {
  it('emits note starts and ends in time order', () => {
    const player = new AutoPlayer([pn(60, 0, 1), pn(64, 1, 1)]);
    player.reset(-1);
    expect(run(player, -0.5)).toEqual([]);
    expect(run(player, 0)).toEqual([{ type: 'noteOn', pitch: 60, velocity: 102 }]);
    expect(run(player, 1)).toEqual([
      { type: 'noteOff', pitch: 60 },
      { type: 'noteOn', pitch: 64, velocity: 102 },
    ]);
    expect(run(player, 5)).toEqual([{ type: 'noteOff', pitch: 64 }]);
  });

  it('scales velocity by volume, never below 1', () => {
    const player = new AutoPlayer([pn(60, 0, 1), pn(62, 0, 1)]);
    player.reset(0);
    const events = run(player, 0, 0.5);
    expect(events).toEqual([
      { type: 'noteOn', pitch: 60, velocity: 51 },
      { type: 'noteOn', pitch: 62, velocity: 51 },
    ]);
    const quiet = new AutoPlayer([pn(60, 0, 1)]);
    quiet.reset(0);
    expect(run(quiet, 0, 0.001)).toEqual([{ type: 'noteOn', pitch: 60, velocity: 1 }]);
  });

  it('retriggers an overlapping note of the same pitch and only releases it at the last end', () => {
    const player = new AutoPlayer([pn(60, 0, 2), pn(60, 1, 2)]);
    player.reset(0);
    expect(run(player, 1)).toEqual([
      { type: 'noteOn', pitch: 60, velocity: 102 },
      { type: 'noteOff', pitch: 60 },
      { type: 'noteOn', pitch: 60, velocity: 102 },
    ]);
    expect(run(player, 2.5)).toEqual([]);
    expect(run(player, 3)).toEqual([{ type: 'noteOff', pitch: 60 }]);
  });

  it('reset skips notes that start before the new position', () => {
    const player = new AutoPlayer([pn(60, 0, 1), pn(64, 2, 1)]);
    player.reset(1);
    expect(run(player, 2)).toEqual([{ type: 'noteOn', pitch: 64, velocity: 102 }]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/engine/scoring.test.ts tests/engine/auto-player.test.ts
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/engine/types.ts`:

```ts
export type Mode = 'wait' | 'tempo';
/** 'none' = just listen: nothing is required, everything is played automatically. */
export type Practice = 'right' | 'left' | 'both' | 'none';

export interface LoopRange {
  /** 0-based, inclusive. */
  startMeasure: number;
  /** 0-based, inclusive. */
  endMeasure: number;
}

export interface SessionConfig {
  mode: Mode;
  practice: Practice;
  /** 0.25–1.5 */
  speed: number;
  loop: LoopRange | null;
  soundOn: boolean;
  /** 0–1, scales the velocity of notes sent to the piano. */
  volume: number;
}

export type OutputEvent =
  | { type: 'noteOn'; pitch: number; velocity: number } // velocity 1–127
  | { type: 'noteOff'; pitch: number }
  | { type: 'allNotesOff' };

export type Status = 'playing' | 'waiting' | 'paused' | 'finished';

/** Colour of a pressed key: the hand it matched, a wrong press, or no judging. */
export type KeyResult = 'right' | 'left' | 'wrong' | 'neutral';

export interface WaitScore {
  kind: 'wait';
  totalSteps: number;
  completedSteps: number;
  cleanSteps: number;
  wrongNotes: number;
  elapsedMs: number;
}

export interface TempoScore {
  kind: 'tempo';
  hits: number;
  perfects: number;
  misses: number;
  extras: number;
  streak: number;
  bestStreak: number;
}

export type Score = WaitScore | TempoScore;

export interface SessionState {
  songTime: number;
  status: Status;
  speed: number;
  loop: LoopRange | null;
  /** Keys currently held, with their colour. */
  pressed: Map<number, KeyResult>;
  /** Wait mode: pitches still needed while the song is waiting. */
  expected: Set<number>;
  /** null when practice is 'none'. */
  score: Score | null;
  /** How many times the loop has restarted. */
  loopPass: number;
  /** Score of the last finished loop pass. */
  lastLoopScore: Score | null;
  /** True once finished, if the run was never seeked nor looped. */
  complete: boolean;
}
```

`src/engine/scoring.ts`:

```ts
import type { Score, TempoScore, WaitScore } from './types';

export function emptyWaitScore(totalSteps: number): WaitScore {
  return { kind: 'wait', totalSteps, completedSteps: 0, cleanSteps: 0, wrongNotes: 0, elapsedMs: 0 };
}

export function emptyTempoScore(): TempoScore {
  return { kind: 'tempo', hits: 0, perfects: 0, misses: 0, extras: 0, streak: 0, bestStreak: 0 };
}

/** Main percentage: clean steps (wait) or accuracy (tempo), rounded 0–100. */
export function scorePercent(score: Score): number {
  if (score.kind === 'wait') {
    return score.totalSteps === 0 ? 0 : Math.round((score.cleanSteps / score.totalSteps) * 100);
  }
  const total = score.hits + score.misses + score.extras;
  return total === 0 ? 0 : Math.round((score.hits / total) * 100);
}
```

`src/engine/auto-player.ts`:

```ts
import type { PlayableNote } from '../song/types';
import { lowerBound } from '../util/bisect';
import type { OutputEvent } from './types';

/** Turns the notes nobody has to play into noteOn/noteOff events as song time passes. */
export class AutoPlayer {
  private next = 0;
  private sounding: { pitch: number; end: number }[] = [];
  private counts = new Map<number, number>();

  constructor(private readonly notes: readonly PlayableNote[]) {}

  /** Positions playback at t: notes starting before t are skipped. Caller sends allNotesOff. */
  reset(t: number): void {
    this.next = lowerBound(this.notes, t);
    this.silence();
  }

  /** Forgets sounding notes without moving the playback position. Caller sends allNotesOff. */
  silence(): void {
    this.sounding = [];
    this.counts.clear();
  }

  /** Emits every note start/end up to and including song time t, in time order. */
  advanceTo(t: number, volume: number, emit: (e: OutputEvent) => void): void {
    for (;;) {
      const startNote = this.next < this.notes.length ? this.notes[this.next] : null;
      const startTime = startNote ? startNote.start : Infinity;
      const endIndex = this.earliestEnd();
      const endTime = endIndex >= 0 ? this.sounding[endIndex].end : Infinity;
      if (Math.min(startTime, endTime) > t) return;

      if (endTime <= startTime) {
        const [{ pitch }] = this.sounding.splice(endIndex, 1);
        const count = (this.counts.get(pitch) ?? 1) - 1;
        if (count <= 0) {
          this.counts.delete(pitch);
          emit({ type: 'noteOff', pitch });
        } else {
          this.counts.set(pitch, count);
        }
      } else {
        const note = startNote!;
        this.next++;
        const count = this.counts.get(note.pitch) ?? 0;
        if (count > 0) emit({ type: 'noteOff', pitch: note.pitch });
        this.counts.set(note.pitch, count + 1);
        this.sounding.push({ pitch: note.pitch, end: note.end });
        const velocity = Math.max(1, Math.min(127, Math.round(note.velocity * 127 * volume)));
        emit({ type: 'noteOn', pitch: note.pitch, velocity });
      }
    }
  }

  private earliestEnd(): number {
    let best = -1;
    for (let i = 0; i < this.sounding.length; i++) {
      if (best < 0 || this.sounding[i].end < this.sounding[best].end) best = i;
    }
    return best;
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/engine/scoring.test.ts tests/engine/auto-player.test.ts
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/scoring.ts src/engine/auto-player.ts tests/engine/scoring.test.ts tests/engine/auto-player.test.ts
git commit -m "feat(engine): add engine types, scoring and auto player" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Practice session: wait mode, tempo mode, loop, speed

The pure practice engine. `PracticeSession` takes wall-clock time in ms (same base as `performance.now()`) and key presses with their own timestamps, and exposes the state to draw plus the MIDI events to send. Wait mode stops at each step until all its keys are pressed (a press up to 100 ms real time early counts; a wrong key spoils the step). Tempo mode judges presses within ±150 ms real time (perfect within ±50 ms) and counts a note as missed 100 ms after its window closes. The A–B loop restarts one measure before A; each pass is scored separately and loops/seeks make the run incomplete (not saved).

**Files:**
- Create: `src/engine/wait-judge.ts`
- Create: `src/engine/tempo-judge.ts`
- Create: `src/engine/session.ts`
- Test: `tests/engine/session.test.ts`
- Test: `tests/engine/wait-mode.test.ts`
- Test: `tests/engine/tempo-mode.test.ts`

**Interfaces:**
- Consumes: From Task 3: `buildSteps`, `Step`. From Task 4: everything in `src/engine/types.ts`, `scoring.ts`, `AutoPlayer`. `lowerBound` (Task 1). Test helper `pn`.
- Produces: In `src/engine/wait-judge.ts`: `EARLY_PRESS_SECONDS`, `class WaitJudge`. In `src/engine/tempo-judge.ts`: `HIT_WINDOW_SECONDS`, `PERFECT_WINDOW_SECONDS`, `MISS_GRACE_SECONDS`, `class TempoJudge`. In `src/engine/session.ts`: `LEAD_IN_SECONDS = 2`, `END_PADDING_SECONDS = 1`, `MIN_SPEED`, `MAX_SPEED`, `practicedRoles(practice): Set<PlayRole>`, `clampSpeed(speed)`, and `class PracticeSession { constructor(notes, measures, config, nowMs); tick(nowMs); noteOn(pitch, velocity, timeMs); noteOff(pitch, timeMs); pause(nowMs); resume(nowMs); seek(t, nowMs); setSpeed(speed, nowMs); setLoop(loop, nowMs); setSound(soundOn, volume); getState(): SessionState; drainOutput(): OutputEvent[] }`.

- [ ] **Step 1: Write the failing tests**

`tests/engine/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PracticeSession } from '../../src/engine/session';
import type { SessionConfig } from '../../src/engine/types';
import { pn } from '../helpers/make-midi';

const MEASURES = [0, 2, 4, 6, 8];

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { mode: 'tempo', practice: 'none', speed: 1, loop: null, soundOn: true, volume: 1, ...overrides };
}

describe('PracticeSession: playback', () => {
  it('starts 2 s before the first note and plays everything when just listening', () => {
    const s = new PracticeSession([pn(60, 0, 1, 'right'), pn(48, 1, 1, 'left')], MEASURES, config(), 0);
    expect(s.getState().songTime).toBe(-2);
    expect(s.drainOutput()).toEqual([]);
    s.tick(2000);
    expect(s.getState().songTime).toBe(0);
    expect(s.drainOutput()).toEqual([{ type: 'noteOn', pitch: 60, velocity: 102 }]);
    s.tick(3000);
    expect(s.drainOutput()).toEqual([
      { type: 'noteOff', pitch: 60 },
      { type: 'noteOn', pitch: 48, velocity: 102 },
    ]);
  });

  it('finishes one second after the last note ends and silences the piano', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config(), 0);
    s.tick(10_000);
    const state = s.getState();
    expect(state.status).toBe('finished');
    expect(state.songTime).toBe(2);
    expect(state.complete).toBe(true);
    expect(s.drainOutput().at(-1)).toEqual({ type: 'allNotesOff' });
  });

  it('only plays the hands that are not being practised', () => {
    const notes = [pn(72, 0, 1, 'right'), pn(48, 0, 1, 'left'), pn(60, 0, 1, 'accompaniment')];
    const s = new PracticeSession(notes, MEASURES, config({ practice: 'right' }), 0);
    s.tick(2000);
    expect(s.drainOutput()).toEqual([
      { type: 'noteOn', pitch: 48, velocity: 102 },
      { type: 'noteOn', pitch: 60, velocity: 102 },
    ]);
  });

  it('sends nothing when sound is off', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config({ soundOn: false }), 0);
    s.tick(2500);
    expect(s.drainOutput()).toEqual([]);
  });

  it('turning sound off mid-song silences the piano', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config(), 0);
    s.tick(2500);
    s.drainOutput();
    s.setSound(false, 1);
    expect(s.drainOutput()).toEqual([{ type: 'allNotesOff' }]);
  });

  it('runs at the configured speed, lead-in included', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config({ speed: 0.5 }), 0);
    expect(s.getState().songTime).toBe(-1);
    s.tick(2000);
    expect(s.getState().songTime).toBe(0);
  });

  it('changing speed keeps the current position', () => {
    const s = new PracticeSession([pn(60, 0, 4)], MEASURES, config(), 0);
    s.tick(2000);
    s.setSpeed(0.5, 3000);
    expect(s.getState().songTime).toBe(1);
    s.tick(5000);
    expect(s.getState().songTime).toBe(2);
    s.setSpeed(9, 5000);
    expect(s.getState().speed).toBe(1.5);
  });

  it('pause freezes time and silences; resume continues from the same point', () => {
    const s = new PracticeSession([pn(60, 0, 4)], MEASURES, config(), 0);
    s.tick(3000);
    s.drainOutput();
    s.pause(3000);
    expect(s.drainOutput()).toEqual([{ type: 'allNotesOff' }]);
    s.tick(9000);
    expect(s.getState()).toMatchObject({ status: 'paused', songTime: 1 });
    s.resume(9000);
    s.tick(9500);
    expect(s.getState()).toMatchObject({ status: 'playing', songTime: 1.5 });
  });

  it('seek moves playback and the run no longer counts as complete', () => {
    const s = new PracticeSession([pn(60, 0, 1), pn(64, 3, 1)], MEASURES, config(), 0);
    s.seek(2.5, 0);
    expect(s.drainOutput()).toEqual([{ type: 'allNotesOff' }]);
    s.tick(500);
    expect(s.drainOutput()).toEqual([{ type: 'noteOn', pitch: 64, velocity: 102 }]);
    s.tick(10_000);
    expect(s.getState()).toMatchObject({ status: 'finished', complete: false });
  });

  it('marks keys pressed while just listening as neutral', () => {
    const s = new PracticeSession([pn(60, 0, 1)], MEASURES, config(), 0);
    s.noteOn(61, 0.5, 100);
    expect(s.getState().pressed.get(61)).toBe('neutral');
    s.noteOff(61, 200);
    expect(s.getState().pressed.has(61)).toBe(false);
  });
});

describe('PracticeSession: A–B loop', () => {
  it('starts one measure before A and wraps back after B', () => {
    const notes = [pn(60, 0.5, 0.5), pn(64, 2.5, 0.5), pn(67, 6.5, 0.5)];
    const s = new PracticeSession(notes, MEASURES, config({ loop: { startMeasure: 1, endMeasure: 1 } }), 0);
    expect(s.getState().songTime).toBe(0);
    s.tick(3900);
    expect(s.getState()).toMatchObject({ songTime: 3.9, loopPass: 0 });
    s.tick(4100);
    expect(s.getState()).toMatchObject({ songTime: 0, loopPass: 1, complete: false });
  });

  it('judges only notes inside the loop and scores each pass', () => {
    const notes = [pn(60, 0.5, 0.5), pn(64, 2.5, 0.5)];
    const s = new PracticeSession(
      notes,
      MEASURES,
      config({ mode: 'wait', practice: 'right', loop: { startMeasure: 1, endMeasure: 1 } }),
      0,
    );
    s.tick(1000);
    expect(s.getState().status).toBe('playing');
    s.tick(2600);
    expect(s.getState()).toMatchObject({ status: 'waiting', songTime: 2.5 });
    s.noteOn(64, 0.8, 2600);
    s.tick(4200);
    const state = s.getState();
    expect(state.loopPass).toBe(1);
    expect(state.lastLoopScore).toMatchObject({ kind: 'wait', totalSteps: 1, cleanSteps: 1 });
    expect(state.score).toMatchObject({ completedSteps: 0 });
  });

  it('setting a loop elsewhere jumps to its lead-in; clearing it keeps the position', () => {
    const s = new PracticeSession([pn(60, 0, 8)], MEASURES, config(), 0);
    s.tick(2500);
    s.setLoop({ startMeasure: 2, endMeasure: 3 }, 2500);
    expect(s.getState().songTime).toBe(2);
    s.tick(3000);
    s.setLoop(null, 3000);
    expect(s.getState()).toMatchObject({ songTime: 2.5, loop: null });
  });
});
```

`tests/engine/wait-mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scorePercent } from '../../src/engine/scoring';
import { PracticeSession } from '../../src/engine/session';
import type { Practice } from '../../src/engine/types';
import { pn } from '../helpers/make-midi';

const MEASURES = [0, 2, 4, 6, 8];

function waitSession(notes: ReturnType<typeof pn>[], practice: Practice = 'right') {
  return new PracticeSession(
    notes,
    MEASURES,
    { mode: 'wait', practice, speed: 1, loop: null, soundOn: true, volume: 1 },
    0,
  );
}

describe('wait mode', () => {
  it('stops at the first step and shows the expected keys', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(5000);
    const state = s.getState();
    expect(state).toMatchObject({ status: 'waiting', songTime: 0 });
    expect([...state.expected]).toEqual([60]);
  });

  it('continues once the right key is pressed', () => {
    const s = waitSession([pn(60, 0, 1), pn(62, 1, 1)]);
    s.tick(5000);
    s.noteOn(60, 0.8, 5000);
    expect(s.getState().pressed.get(60)).toBe('right');
    expect(s.getState().status).toBe('playing');
    s.tick(5500);
    expect(s.getState().songTime).toBe(0.5);
    expect(s.getState().score).toMatchObject({ completedSteps: 1, cleanSteps: 1 });
  });

  it('needs every key of a chord', () => {
    const s = waitSession([pn(60, 0, 1), pn(64, 0.01, 1)]);
    s.tick(3000);
    s.noteOn(60, 0.8, 3000);
    expect(s.getState().status).toBe('waiting');
    expect([...s.getState().expected]).toEqual([64]);
    s.noteOn(64, 0.8, 3100);
    expect(s.getState().status).toBe('playing');
  });

  it('a wrong key turns red, does not advance, and spoils the step', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(3000);
    s.noteOn(61, 0.8, 3000);
    expect(s.getState().pressed.get(61)).toBe('wrong');
    expect(s.getState().status).toBe('waiting');
    s.noteOn(60, 0.8, 3200);
    expect(s.getState().score).toMatchObject({ completedSteps: 1, cleanSteps: 0, wrongNotes: 1 });
  });

  it('accepts a press up to 100 ms early', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(1950);
    s.noteOn(60, 0.8, 1950);
    s.tick(2100);
    expect(s.getState().status).toBe('playing');
    expect(s.getState().songTime).toBeCloseTo(0.1);
    expect(s.getState().score).toMatchObject({ cleanSteps: 1, wrongNotes: 0 });
  });

  it('a press 300 ms early is wrong', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(1700);
    s.noteOn(60, 0.8, 1700);
    expect(s.getState().pressed.get(60)).toBe('wrong');
    s.tick(2100);
    expect(s.getState().status).toBe('waiting');
  });

  it('holding a key does not play the next repeat of the same note', () => {
    const s = waitSession([pn(60, 0, 0.5), pn(60, 1, 0.5)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2000);
    s.tick(4000);
    expect(s.getState()).toMatchObject({ status: 'waiting', songTime: 1 });
    s.noteOff(60, 4100);
    s.noteOn(60, 0.8, 4200);
    expect(s.getState().status).toBe('playing');
  });

  it('practising the left hand waits for left-hand notes and plays the right hand', () => {
    const s = waitSession([pn(72, 0, 1, 'right'), pn(48, 0, 1, 'left')], 'left');
    s.tick(2000);
    expect(s.drainOutput()).toEqual([{ type: 'noteOn', pitch: 72, velocity: 102 }]);
    expect([...s.getState().expected]).toEqual([48]);
    s.noteOn(48, 0.8, 2100);
    expect(s.getState().pressed.get(48)).toBe('left');
  });

  it('counts elapsed time while waiting but not while paused', () => {
    const s = waitSession([pn(60, 0, 1)]);
    s.tick(3000);
    s.pause(3000);
    s.tick(60_000);
    s.resume(60_000);
    s.tick(61_000);
    expect(s.getState().score).toMatchObject({ elapsedMs: 4000 });
  });

  it('finishes after the last step and reports a percentage', () => {
    const s = waitSession([pn(60, 0, 0.5), pn(62, 0.5, 0.5)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2000);
    s.tick(2500);
    s.noteOn(63, 0.8, 2500);
    s.noteOn(62, 0.8, 2600);
    s.tick(10_000);
    const state = s.getState();
    expect(state).toMatchObject({ status: 'finished', complete: true });
    expect(scorePercent(state.score!)).toBe(50);
  });
});
```

`tests/engine/tempo-mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scorePercent } from '../../src/engine/scoring';
import { PracticeSession } from '../../src/engine/session';
import { pn } from '../helpers/make-midi';

const MEASURES = [0, 2, 4, 6, 8];

function tempoSession(notes: ReturnType<typeof pn>[], speed = 1) {
  return new PracticeSession(
    notes,
    MEASURES,
    { mode: 'tempo', practice: 'both', speed, loop: null, soundOn: true, volume: 1 },
    0,
  );
}

describe('tempo mode', () => {
  it('never stops for the player', () => {
    const s = tempoSession([pn(60, 0, 1)]);
    s.tick(2500);
    expect(s.getState()).toMatchObject({ status: 'playing', songTime: 0.5 });
  });

  it('a press within 50 ms is a perfect hit', () => {
    const s = tempoSession([pn(60, 0, 1)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2040);
    expect(s.getState().pressed.get(60)).toBe('right');
    expect(s.getState().score).toMatchObject({ hits: 1, perfects: 1, streak: 1 });
  });

  it('a press within 150 ms is a hit but not perfect', () => {
    const s = tempoSession([pn(48, 0, 1, 'left')]);
    s.tick(1900);
    s.noteOn(48, 0.8, 1880);
    expect(s.getState().pressed.get(48)).toBe('left');
    expect(s.getState().score).toMatchObject({ hits: 1, perfects: 0 });
  });

  it('a press 200 ms late is an extra note, and the note is then missed', () => {
    const s = tempoSession([pn(60, 0, 1)]);
    s.tick(2200);
    s.noteOn(60, 0.8, 2200);
    expect(s.getState().pressed.get(60)).toBe('wrong');
    s.tick(2300);
    expect(s.getState().score).toMatchObject({ hits: 0, extras: 1, misses: 1 });
  });

  it('judges a press by its own timestamp even if it arrives after the frame', () => {
    const s = tempoSession([pn(60, 0, 1)]);
    s.tick(2160);
    s.noteOn(60, 0.8, 2010);
    expect(s.getState().score).toMatchObject({ hits: 1, perfects: 1 });
  });

  it('the hit window scales with speed', () => {
    const s = tempoSession([pn(60, 0, 1)], 0.5);
    // At half speed the note arrives at 2000 ms; 140 ms late is still inside ±150 ms real time.
    s.tick(2140);
    s.noteOn(60, 0.8, 2140);
    expect(s.getState().score).toMatchObject({ hits: 1 });
  });

  it('wrong keys break the streak', () => {
    const s = tempoSession([pn(60, 0, 0.5), pn(62, 0.5, 0.5), pn(64, 1, 0.5)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2000);
    s.tick(2500);
    s.noteOn(62, 0.8, 2500);
    s.noteOn(70, 0.8, 2600);
    s.tick(3000);
    s.noteOn(64, 0.8, 3000);
    expect(s.getState().score).toMatchObject({ hits: 3, extras: 1, streak: 1, bestStreak: 2 });
  });

  it('counts unplayed notes as misses by the end and reports accuracy', () => {
    const s = tempoSession([pn(60, 0, 0.5), pn(62, 0.5, 0.5), pn(64, 1, 0.5), pn(65, 1.5, 0.5)]);
    s.tick(2000);
    s.noteOn(60, 0.8, 2000);
    s.tick(10_000);
    const state = s.getState();
    expect(state.status).toBe('finished');
    expect(state.score).toMatchObject({ hits: 1, misses: 3 });
    expect(scorePercent(state.score!)).toBe(25);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/engine
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/engine/wait-judge.ts`:

```ts
import { buildSteps, type Step } from '../song/steps';
import type { PlayableNote } from '../song/types';
import { emptyWaitScore } from './scoring';
import type { KeyResult, WaitScore } from './types';

/** A press up to this many real seconds before the song reaches a step counts for it. */
export const EARLY_PRESS_SECONDS = 0.1;

/** Wait mode: the song stops at each step until all its keys are pressed. */
export class WaitJudge {
  private steps: Step[] = [];
  private index = 0;
  private done = new Set<number>();
  private dirty = false;
  score: WaitScore = emptyWaitScore(0);

  constructor(private readonly required: readonly PlayableNote[]) {}

  /** Judges only steps starting in [from, to). Resets the score. */
  reset(from: number, to: number): void {
    this.steps = buildSteps(this.required.filter((n) => n.start >= from && n.start < to));
    this.index = 0;
    this.done.clear();
    this.dirty = false;
    this.score = emptyWaitScore(this.steps.length);
  }

  /** Song time where the clock must stop, or Infinity when no steps remain. */
  get holdTime(): number {
    return this.index < this.steps.length ? this.steps[this.index].time : Infinity;
  }

  /** Pitches of the current step not pressed yet. */
  get pending(): number[] {
    const step = this.steps[this.index];
    if (!step) return [];
    return [...new Set(step.notes.map((n) => n.pitch))].filter((p) => !this.done.has(p));
  }

  /**
   * Judges a key press made `secondsUntilStep` real seconds before the song
   * reaches the current step (0 while waiting at it).
   */
  press(pitch: number, secondsUntilStep: number): { result: KeyResult; completed: boolean } {
    const step = this.steps[this.index];
    const note = step?.notes.find((n) => n.pitch === pitch);
    if (!step || !note || secondsUntilStep > EARLY_PRESS_SECONDS) {
      this.score.wrongNotes++;
      this.dirty = true;
      return { result: 'wrong', completed: false };
    }
    this.done.add(pitch);
    const completed = step.notes.every((n) => this.done.has(n.pitch));
    if (completed) {
      this.score.completedSteps++;
      if (!this.dirty) this.score.cleanSteps++;
      this.index++;
      this.done.clear();
      this.dirty = false;
    }
    return { result: note.role === 'left' ? 'left' : 'right', completed };
  }

  addElapsed(ms: number): void {
    this.score.elapsedMs += ms;
  }
}
```

`src/engine/tempo-judge.ts`:

```ts
import type { PlayableNote } from '../song/types';
import { lowerBound } from '../util/bisect';
import { emptyTempoScore } from './scoring';
import type { KeyResult, TempoScore } from './types';

/** Real seconds either side of a note's start in which a press is a hit. */
export const HIT_WINDOW_SECONDS = 0.15;
/** Real seconds either side of a note's start in which a hit is perfect. */
export const PERFECT_WINDOW_SECONDS = 0.05;
/** Extra real seconds before an unplayed note counts as missed (absorbs MIDI delivery lag). */
export const MISS_GRACE_SECONDS = 0.1;

/** Tempo mode: the song never stops; presses are matched to notes by timing. */
export class TempoJudge {
  private notes: PlayableNote[] = [];
  private matched = new Set<number>();
  private cursor = 0;
  score: TempoScore = emptyTempoScore();

  constructor(private readonly required: readonly PlayableNote[]) {}

  /** Judges only notes starting in [from, to). Resets the score. */
  reset(from: number, to: number): void {
    this.notes = this.required.filter((n) => n.start >= from && n.start < to);
    this.matched.clear();
    this.cursor = 0;
    this.score = emptyTempoScore();
  }

  /** Counts as missed every unmatched note whose window closed before song time t. */
  advanceTo(t: number, speed: number): void {
    const limit = (HIT_WINDOW_SECONDS + MISS_GRACE_SECONDS) * speed;
    while (this.cursor < this.notes.length && this.notes[this.cursor].start + limit < t) {
      this.judgeMiss(this.notes[this.cursor++]);
    }
  }

  /** Counts every note not judged yet as missed (end of song or loop pass). */
  finalize(): void {
    while (this.cursor < this.notes.length) this.judgeMiss(this.notes[this.cursor++]);
  }

  /** Judges a key press made at song time t. */
  press(pitch: number, t: number, speed: number): KeyResult {
    const window = HIT_WINDOW_SECONDS * speed;
    let best: PlayableNote | null = null;
    for (
      let i = Math.max(this.cursor, lowerBound(this.notes, t - window));
      i < this.notes.length && this.notes[i].start <= t + window;
      i++
    ) {
      const n = this.notes[i];
      if (n.pitch !== pitch || this.matched.has(n.id)) continue;
      if (!best || Math.abs(n.start - t) < Math.abs(best.start - t)) best = n;
    }
    if (!best) {
      this.score.extras++;
      this.score.streak = 0;
      return 'wrong';
    }
    this.matched.add(best.id);
    this.score.hits++;
    if (Math.abs(best.start - t) / speed <= PERFECT_WINDOW_SECONDS) this.score.perfects++;
    this.score.streak++;
    this.score.bestStreak = Math.max(this.score.bestStreak, this.score.streak);
    return best.role === 'left' ? 'left' : 'right';
  }

  private judgeMiss(note: PlayableNote): void {
    if (this.matched.has(note.id)) return;
    this.score.misses++;
    this.score.streak = 0;
  }
}
```

`src/engine/session.ts`:

```ts
import type { PlayableNote, PlayRole } from '../song/types';
import { AutoPlayer } from './auto-player';
import { TempoJudge } from './tempo-judge';
import type {
  KeyResult,
  LoopRange,
  OutputEvent,
  Practice,
  Score,
  SessionConfig,
  SessionState,
  Status,
} from './types';
import { WaitJudge } from './wait-judge';

/** Real seconds of falling notes before the first note of the song. */
export const LEAD_IN_SECONDS = 2;
/** Song seconds after the last note ends before the session finishes. */
export const END_PADDING_SECONDS = 1;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 1.5;

interface LoopBounds {
  start: number;
  end: number;
  /** Where each pass restarts: one measure before `start`. */
  restart: number;
}

export function practicedRoles(practice: Practice): Set<PlayRole> {
  switch (practice) {
    case 'right':
      return new Set(['right']);
    case 'left':
      return new Set(['left']);
    case 'both':
      return new Set(['right', 'left']);
    case 'none':
      return new Set();
  }
}

export function clampSpeed(speed: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

/**
 * One practice run over a song. Pure logic: the caller feeds wall-clock time
 * (ms, same base as performance.now()) and key presses, renders getState()
 * and sends drainOutput() to the piano.
 */
export class PracticeSession {
  private readonly config: SessionConfig;
  private readonly auto: AutoPlayer;
  private readonly wait: WaitJudge | null;
  private readonly tempo: TempoJudge | null;
  private readonly startTime: number;
  private readonly endTime: number;
  private songTime = 0;
  private lastWallMs: number;
  private status: Status = 'playing';
  private resumeStatus: 'playing' | 'waiting' = 'playing';
  private out: OutputEvent[] = [];
  private pressed = new Map<number, KeyResult>();
  private loopPass = 0;
  private lastLoopScore: Score | null = null;
  private pristine = true;

  constructor(
    notes: readonly PlayableNote[],
    private readonly measures: readonly number[],
    config: SessionConfig,
    nowMs: number,
  ) {
    this.config = { ...config, speed: clampSpeed(config.speed) };
    const practiced = practicedRoles(config.practice);
    const required = notes.filter((n) => practiced.has(n.role));
    this.auto = new AutoPlayer(notes.filter((n) => !practiced.has(n.role)));
    const judging = config.practice !== 'none';
    this.wait = judging && config.mode === 'wait' ? new WaitJudge(required) : null;
    this.tempo = judging && config.mode === 'tempo' ? new TempoJudge(required) : null;
    this.startTime = (notes[0]?.start ?? 0) - LEAD_IN_SECONDS * this.config.speed;
    this.endTime = notes.reduce((max, n) => Math.max(max, n.end), 0) + END_PADDING_SECONDS;
    this.lastWallMs = nowMs;
    const loop = this.loopBounds();
    if (loop) this.pristine = false;
    this.jumpTo(loop ? loop.restart : this.startTime);
    this.out = [];
  }

  tick(nowMs: number): void {
    const dtMs = Math.max(0, nowMs - this.lastWallMs);
    this.lastWallMs = Math.max(this.lastWallMs, nowMs);
    if (this.status === 'paused' || this.status === 'finished') return;
    this.wait?.addElapsed(dtMs);
    if (this.status === 'waiting') return;
    this.advanceSong(this.songTime + (dtMs / 1000) * this.config.speed);
  }

  noteOn(pitch: number, _velocity: number, timeMs: number): void {
    if (timeMs > this.lastWallMs) this.tick(timeMs);
    if (this.status === 'paused' || this.status === 'finished' || (!this.wait && !this.tempo)) {
      this.pressed.set(pitch, 'neutral');
      return;
    }
    const lagSeconds = Math.max(0, this.lastWallMs - timeMs) / 1000;
    const waiting = this.status === 'waiting';
    const eventTime = waiting ? this.songTime : this.songTime - lagSeconds * this.config.speed;
    let result: KeyResult;
    if (this.wait) {
      const secondsUntilStep = Math.max(0, (this.wait.holdTime - eventTime) / this.config.speed);
      const judged = this.wait.press(pitch, secondsUntilStep);
      result = judged.result;
      if (judged.completed && waiting) this.status = 'playing';
    } else {
      result = this.tempo!.press(pitch, eventTime, this.config.speed);
    }
    this.pressed.set(pitch, result);
  }

  noteOff(pitch: number, _timeMs: number): void {
    this.pressed.delete(pitch);
  }

  pause(nowMs: number): void {
    this.tick(nowMs);
    if (this.status !== 'playing' && this.status !== 'waiting') return;
    this.resumeStatus = this.status;
    this.status = 'paused';
    this.auto.silence();
    this.out.push({ type: 'allNotesOff' });
  }

  resume(nowMs: number): void {
    if (this.status !== 'paused') return;
    this.status = this.resumeStatus;
    this.lastWallMs = nowMs;
  }

  /** Jumps to song time t. The run no longer counts as complete. */
  seek(t: number, nowMs: number): void {
    this.tick(nowMs);
    this.lastWallMs = nowMs;
    this.pristine = false;
    this.jumpTo(Math.min(this.endTime, Math.max(Math.min(0, this.startTime), t)));
  }

  setSpeed(speed: number, nowMs: number): void {
    this.tick(nowMs);
    this.config.speed = clampSpeed(speed);
  }

  /** Sets or clears the A–B loop. The run no longer counts as complete. */
  setLoop(loop: LoopRange | null, nowMs: number): void {
    this.tick(nowMs);
    this.config.loop = loop;
    this.pristine = false;
    const bounds = this.loopBounds();
    if (bounds && (this.songTime < bounds.restart || this.songTime >= bounds.end)) {
      this.jumpTo(bounds.restart);
    } else {
      this.resetJudges(this.songTime);
      if (this.status === 'waiting') this.status = 'playing';
    }
  }

  setSound(soundOn: boolean, volume: number): void {
    const wasAudible = this.audible;
    this.config.soundOn = soundOn;
    this.config.volume = volume;
    if (wasAudible && !this.audible) {
      this.auto.silence();
      this.out.push({ type: 'allNotesOff' });
    }
  }

  getState(): SessionState {
    return {
      songTime: this.songTime,
      status: this.status,
      speed: this.config.speed,
      loop: this.config.loop,
      pressed: new Map(this.pressed),
      expected: new Set(this.status === 'waiting' && this.wait ? this.wait.pending : []),
      score: this.wait?.score ?? this.tempo?.score ?? null,
      loopPass: this.loopPass,
      lastLoopScore: this.lastLoopScore,
      complete: this.pristine && this.status === 'finished',
    };
  }

  /** Events for the piano since the last call. */
  drainOutput(): OutputEvent[] {
    const out = this.out;
    this.out = [];
    return out;
  }

  private get audible(): boolean {
    return this.config.soundOn && this.config.volume > 0;
  }

  private advanceSong(target: number): void {
    if (this.wait && this.wait.holdTime <= target) {
      this.moveTo(Math.max(this.songTime, this.wait.holdTime));
      this.status = 'waiting';
      return;
    }
    const loop = this.loopBounds();
    if (loop && target >= loop.end) {
      this.moveTo(loop.end);
      this.tempo?.finalize();
      this.loopPass++;
      const score = this.wait?.score ?? this.tempo?.score ?? null;
      this.lastLoopScore = score ? { ...score } : null;
      this.jumpTo(loop.restart);
      return;
    }
    if (!loop && target >= this.endTime) {
      this.moveTo(this.endTime);
      this.tempo?.finalize();
      this.status = 'finished';
      this.auto.silence();
      this.out.push({ type: 'allNotesOff' });
      return;
    }
    this.moveTo(target);
  }

  private moveTo(t: number): void {
    const audible = this.audible;
    this.auto.advanceTo(t, this.config.volume, (e) => {
      if (audible) this.out.push(e);
    });
    this.tempo?.advanceTo(t, this.config.speed);
    this.songTime = t;
  }

  private jumpTo(t: number): void {
    this.songTime = t;
    this.auto.reset(t);
    this.out.push({ type: 'allNotesOff' });
    this.resetJudges(t);
    if (this.status !== 'paused') this.status = 'playing';
    this.resumeStatus = 'playing';
  }

  private resetJudges(from: number): void {
    const loop = this.loopBounds();
    const start = loop ? Math.max(from, loop.start) : from;
    const end = loop ? loop.end : Infinity;
    this.wait?.reset(start, end);
    this.tempo?.reset(start, end);
  }

  private loopBounds(): LoopBounds | null {
    const loop = this.config.loop;
    const count = this.measures.length - 1;
    if (!loop || count < 1) return null;
    const first = Math.min(Math.max(0, loop.startMeasure), count - 1);
    const last = Math.min(Math.max(first, loop.endMeasure), count - 1);
    const start = this.measures[first];
    const leadIn = this.measures[first + 1] - start;
    return { start, end: this.measures[last + 1], restart: start - leadIn };
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/engine
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/engine/wait-judge.ts src/engine/tempo-judge.ts src/engine/session.ts tests/engine/session.test.ts tests/engine/wait-mode.test.ts tests/engine/tempo-mode.test.ts
git commit -m "feat(engine): add practice session with wait, tempo and loop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: MIDI messages and BLE-MIDI packets

Pure MIDI byte handling shared by USB and Bluetooth: decode note on/off, encode engine output on channel 1 (remembering sounding notes so `allNotesOff` releases each one before CC 123), choose the preferred port, and decode/encode BLE-MIDI packets (header + per-message timestamps, running status, SysEx and real-time bytes skipped).

**Files:**
- Create: `src/midi-io/types.ts`
- Create: `src/midi-io/messages.ts`
- Create: `src/midi-io/ble-packet.ts`
- Test: `tests/midi-io/messages.test.ts`
- Test: `tests/midi-io/ble-packet.test.ts`

**Interfaces:**
- Consumes: `OutputEvent` (Task 4).
- Produces: In `src/midi-io/types.ts`: `NoteEvent`, `ConnectionKind`, `MidiConnection`, `ConnectionError`, `ConnectionStatus`. In `src/midi-io/messages.ts`: `decodeMidiMessage(data, timeMs): NoteEvent | null`, `class MidiOutputEncoder { encode(event): number[][] }`, `pickPreferredPort<T extends { name: string }>(ports, preferredName): T | null`. In `src/midi-io/ble-packet.ts`: `BLE_MIDI_SERVICE`, `BLE_MIDI_CHARACTERISTIC`, `MESSAGES_PER_PACKET = 4`, `decodeBlePacket(packet: Uint8Array): number[][]`, `encodeBlePacket(messages, timeMs): Uint8Array<ArrayBuffer>`.

- [ ] **Step 1: Write the failing tests**

`tests/midi-io/messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MidiOutputEncoder, decodeMidiMessage, pickPreferredPort } from '../../src/midi-io/messages';

describe('decodeMidiMessage', () => {
  it('decodes note on on any channel', () => {
    expect(decodeMidiMessage([0x93, 60, 127], 5)).toEqual({ type: 'on', pitch: 60, velocity: 1, timeMs: 5 });
  });

  it('treats note off and note on with velocity 0 as off', () => {
    expect(decodeMidiMessage([0x80, 60, 64], 1)).toEqual({ type: 'off', pitch: 60, velocity: 0, timeMs: 1 });
    expect(decodeMidiMessage([0x90, 60, 0], 1)).toEqual({ type: 'off', pitch: 60, velocity: 0, timeMs: 1 });
  });

  it('ignores pedal, other messages and short data', () => {
    expect(decodeMidiMessage([0xb0, 64, 127], 0)).toBeNull();
    expect(decodeMidiMessage([0xfe], 0)).toBeNull();
  });
});

describe('MidiOutputEncoder', () => {
  it('encodes notes on channel 1', () => {
    const enc = new MidiOutputEncoder();
    expect(enc.encode({ type: 'noteOn', pitch: 60, velocity: 100 })).toEqual([[0x90, 60, 100]]);
    expect(enc.encode({ type: 'noteOff', pitch: 60 })).toEqual([[0x80, 60, 0]]);
  });

  it('allNotesOff releases the notes it switched on, then sends CC 123', () => {
    const enc = new MidiOutputEncoder();
    enc.encode({ type: 'noteOn', pitch: 60, velocity: 100 });
    enc.encode({ type: 'noteOn', pitch: 64, velocity: 100 });
    enc.encode({ type: 'noteOff', pitch: 60 });
    expect(enc.encode({ type: 'allNotesOff' })).toEqual([
      [0x80, 64, 0],
      [0xb0, 123, 0],
    ]);
    expect(enc.encode({ type: 'allNotesOff' })).toEqual([[0xb0, 123, 0]]);
  });
});

describe('pickPreferredPort', () => {
  const ports = [{ name: 'Midi Through' }, { name: 'FP-10 MIDI 1' }, { name: 'Other' }];

  it('prefers the remembered port', () => {
    expect(pickPreferredPort(ports, 'Other')).toEqual({ name: 'Other' });
  });

  it('then a Roland FP-10', () => {
    expect(pickPreferredPort(ports, 'Gone')).toEqual({ name: 'FP-10 MIDI 1' });
    expect(pickPreferredPort([{ name: 'a' }, { name: 'ROLAND Digital Piano' }], null)).toEqual({
      name: 'ROLAND Digital Piano',
    });
  });

  it('then the first port, or null', () => {
    expect(pickPreferredPort([{ name: 'a' }, { name: 'b' }], null)).toEqual({ name: 'a' });
    expect(pickPreferredPort([], null)).toBeNull();
  });
});
```

`tests/midi-io/ble-packet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeBlePacket, encodeBlePacket } from '../../src/midi-io/ble-packet';

const bytes = (...b: number[]) => Uint8Array.from(b);

describe('decodeBlePacket', () => {
  it('decodes a single note on', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60, 100))).toEqual([[0x90, 60, 100]]);
  });

  it('decodes several full messages', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60, 100, 0x82, 0x80, 61, 0))).toEqual([
      [0x90, 60, 100],
      [0x80, 61, 0],
    ]);
  });

  it('decodes running status without a timestamp', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60, 100, 64, 90))).toEqual([
      [0x90, 60, 100],
      [0x90, 64, 90],
    ]);
  });

  it('decodes running status with a new timestamp', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60, 100, 0x85, 64, 90))).toEqual([
      [0x90, 60, 100],
      [0x90, 64, 90],
    ]);
  });

  it('decodes one-data-byte messages', () => {
    expect(decodeBlePacket(bytes(0x80, 0x81, 0xc0, 5, 0x81, 0x90, 60, 1))).toEqual([
      [0xc0, 5],
      [0x90, 60, 1],
    ]);
  });

  it('skips SysEx and real-time bytes', () => {
    expect(
      decodeBlePacket(bytes(0x80, 0x81, 0xf0, 0x41, 0x10, 0x81, 0xf7, 0x82, 0xfe, 0x83, 0x90, 60, 100)),
    ).toEqual([[0x90, 60, 100]]);
  });

  it('ignores invalid, empty or truncated packets', () => {
    expect(decodeBlePacket(bytes())).toEqual([]);
    expect(decodeBlePacket(bytes(0x10, 0x81, 0x90, 60, 100))).toEqual([]);
    expect(decodeBlePacket(bytes(0x80, 0x81, 0x90, 60))).toEqual([]);
    expect(decodeBlePacket(bytes(0x80, 60, 100))).toEqual([]);
  });
});

describe('encodeBlePacket', () => {
  it('writes header and per-message timestamps from the low 13 bits of the time', () => {
    // 1000 ms = 0b00111_1101000 -> header 0x80|0x07, timestamp 0x80|0x68
    expect([...encodeBlePacket([[0x90, 60, 100], [0x80, 61, 0]], 1000)]).toEqual([
      0x87, 0xe8, 0x90, 60, 100, 0xe8, 0x80, 61, 0,
    ]);
  });

  it('round-trips through the decoder', () => {
    const messages = [[0x90, 60, 100], [0x80, 60, 0], [0xb0, 123, 0]];
    expect(decodeBlePacket(encodeBlePacket(messages, 123_456))).toEqual(messages);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/midi-io/messages.test.ts tests/midi-io/ble-packet.test.ts
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/midi-io/types.ts`:

```ts
import type { OutputEvent } from '../engine/types';

export interface NoteEvent {
  type: 'on' | 'off';
  pitch: number;
  /** 0–1 */
  velocity: number;
  /** Same time base as performance.now(). */
  timeMs: number;
}

export type ConnectionKind = 'usb' | 'ble';

/** A live link to the piano, whatever the transport. */
export interface MidiConnection {
  readonly kind: ConnectionKind;
  readonly name: string;
  onNote(cb: (e: NoteEvent) => void): () => void;
  onDisconnect(cb: () => void): () => void;
  send(event: OutputEvent): void;
  close(): void;
}

export type ConnectionError =
  | 'midi-unsupported'
  | 'midi-denied'
  | 'bluetooth-unsupported'
  | 'bluetooth-failed';

export type ConnectionStatus =
  | { state: 'disconnected'; error: ConnectionError | null }
  | { state: 'connecting'; kind: ConnectionKind }
  | { state: 'connected'; kind: ConnectionKind; name: string };
```

`src/midi-io/messages.ts`:

```ts
import type { OutputEvent } from '../engine/types';
import type { NoteEvent } from './types';

/** Note on/off from raw MIDI bytes; anything else (pedal, CC, clock…) is null. */
export function decodeMidiMessage(data: ArrayLike<number>, timeMs: number): NoteEvent | null {
  if (data.length < 3) return null;
  const type = data[0] & 0xf0;
  if (type === 0x90 && data[2] > 0) {
    return { type: 'on', pitch: data[1], velocity: data[2] / 127, timeMs };
  }
  if (type === 0x80 || type === 0x90) {
    return { type: 'off', pitch: data[1], velocity: 0, timeMs };
  }
  return null;
}

/**
 * Turns engine output into raw MIDI messages on channel 1, remembering which
 * notes it switched on so allNotesOff can release each one explicitly.
 */
export class MidiOutputEncoder {
  private on = new Set<number>();

  encode(event: OutputEvent): number[][] {
    switch (event.type) {
      case 'noteOn':
        this.on.add(event.pitch);
        return [[0x90, event.pitch, event.velocity]];
      case 'noteOff':
        this.on.delete(event.pitch);
        return [[0x80, event.pitch, 0]];
      case 'allNotesOff': {
        const messages = [...this.on].map((pitch) => [0x80, pitch, 0]);
        this.on.clear();
        messages.push([0xb0, 123, 0]);
        return messages;
      }
    }
  }
}

/** Picks the port to use: the remembered one, else a Roland FP-10, else the first. */
export function pickPreferredPort<T extends { name: string }>(ports: readonly T[], preferredName: string | null): T | null {
  return (
    (preferredName ? ports.find((p) => p.name === preferredName) : undefined) ??
    ports.find((p) => /fp-?10|roland/i.test(p.name)) ??
    ports[0] ??
    null
  );
}
```

`src/midi-io/ble-packet.ts`:

```ts
// BLE-MIDI packet format (MIDI over Bluetooth Low Energy spec):
// [header 1tttttt] then, per message: [timestamp 1ttttttt] [status] [data…].
// A message may omit its status (running status) and, after a full message,
// also its timestamp. SysEx and system real-time bytes are skipped.

export const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const BLE_MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';
/** Messages per packet so it fits the default 20-byte BLE payload (1 + 4 × 4 bytes). */
export const MESSAGES_PER_PACKET = 4;

function dataLength(status: number): number {
  const high = status & 0xf0;
  if (high === 0xc0 || high === 0xd0) return 1;
  if (high < 0xf0) return 2;
  if (status === 0xf1 || status === 0xf3) return 1;
  if (status === 0xf2) return 2;
  return 0;
}

/** Raw MIDI messages contained in one BLE-MIDI packet. */
export function decodeBlePacket(packet: Uint8Array): number[][] {
  const messages: number[][] = [];
  if (packet.length < 2 || (packet[0] & 0x80) === 0) return messages;
  let running = 0;
  let i = 1;
  while (i < packet.length) {
    if (packet[i] & 0x80) {
      // Timestamp byte, optionally followed by a status byte.
      i++;
      if (i >= packet.length) break;
      const b = packet[i];
      if (b & 0x80) {
        i++;
        if (b === 0xf0) {
          while (i < packet.length && packet[i] !== 0xf7) i++;
          i++;
          running = 0;
          continue;
        }
        if (b === 0xf7 || b >= 0xf8) {
          if (b === 0xf7) running = 0;
          continue;
        }
        running = b;
      }
    }
    if (!running) {
      i++;
      continue;
    }
    const length = dataLength(running);
    if (i + length > packet.length) break;
    messages.push([running, ...packet.subarray(i, i + length)]);
    i += length;
    if (running >= 0xf0) running = 0;
  }
  return messages;
}

/** One BLE-MIDI packet carrying the given messages, all stamped with timeMs. */
export function encodeBlePacket(messages: readonly number[][], timeMs: number): Uint8Array<ArrayBuffer> {
  const ts = Math.floor(timeMs) & 0x1fff;
  const timestamp = 0x80 | (ts & 0x7f);
  const bytes = [0x80 | (ts >> 7)];
  for (const m of messages) bytes.push(timestamp, ...m);
  return Uint8Array.from(bytes);
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/midi-io/messages.test.ts tests/midi-io/ble-packet.test.ts
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/midi-io/types.ts src/midi-io/messages.ts src/midi-io/ble-packet.ts tests/midi-io/messages.test.ts tests/midi-io/ble-packet.test.ts
git commit -m "feat(midi): decode/encode MIDI messages and BLE-MIDI packets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: USB and Bluetooth connections

Browser-facing connections: `WebMidiConnection` (Web MIDI, reports its own port disconnecting), `BleMidiConnection` (Web Bluetooth, queued GATT writes, up to 3 reconnect attempts at 1/2/4 s), and `ConnectionManager`, which auto-connects the best USB input (and again on hot-plug), connects Bluetooth on request, merges in on-screen notes and is a Svelte-store-compatible status source. Browser APIs are injected so the manager is tested with fakes.

**Files:**
- Create: `src/midi-io/web-midi.ts`
- Create: `src/midi-io/ble-midi.ts`
- Create: `src/midi-io/connection-manager.ts`
- Test: `tests/midi-io/connection-manager.test.ts`

**Interfaces:**
- Consumes: From Task 6: everything in `src/midi-io/types.ts`, `messages.ts`, `ble-packet.ts`. `OutputEvent` (Task 4).
- Produces: In `src/midi-io/web-midi.ts`: `eventTime(timeStamp, now)`, `class WebMidiConnection`. In `src/midi-io/ble-midi.ts`: `class BleMidiConnection { static request(bluetooth: Bluetooth): Promise<BleMidiConnection> }`. In `src/midi-io/connection-manager.ts`: `MidiAccessError`, `BluetoothUnavailableError`, `interface PortInfo { id; name }`, `interface ConnectionDeps`, and `class ConnectionManager { constructor(deps?); subscribe(cb): () => void; current: ConnectionStatus; onNote(cb): () => void; emitVirtual(e: NoteEvent); send(e: OutputEvent); startUsb(preferredName: string | null): Promise<void>; listUsbInputs(): PortInfo[]; deviceName: string | null; selectUsbInput(id); connectBluetooth(): Promise<void>; disconnect() }`.

- [ ] **Step 1: Write the failing tests**

`tests/midi-io/connection-manager.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  BluetoothUnavailableError,
  ConnectionManager,
  MidiAccessError,
} from '../../src/midi-io/connection-manager';
import type { ConnectionStatus, MidiConnection, NoteEvent } from '../../src/midi-io/types';

class FakePort {
  state: 'connected' | 'disconnected' = 'connected';
  onmidimessage: ((e: { data: Uint8Array; timeStamp: number }) => void) | null = null;
  sent: number[][] = [];
  private listeners = new Set<() => void>();
  constructor(
    readonly id: string,
    readonly name: string,
  ) {}
  addEventListener(_type: string, cb: () => void) {
    this.listeners.add(cb);
  }
  removeEventListener(_type: string, cb: () => void) {
    this.listeners.delete(cb);
  }
  send(data: number[]) {
    this.sent.push(data);
  }
  unplug() {
    this.state = 'disconnected';
    for (const cb of this.listeners) cb();
  }
  play(data: number[], timeStamp = performance.now()) {
    this.onmidimessage?.({ data: Uint8Array.from(data), timeStamp });
  }
}

class FakeAccess {
  inputs = new Map<string, FakePort>();
  outputs = new Map<string, FakePort>();
  onstatechange: (() => void) | null = null;
  plug(input: FakePort, output?: FakePort) {
    this.inputs.set(input.id, input);
    if (output) this.outputs.set(output.id, output);
    this.onstatechange?.();
  }
}

function setup() {
  const access = new FakeAccess();
  const manager = new ConnectionManager({
    requestMIDIAccess: async () => access as unknown as MIDIAccess,
  });
  const statuses: ConnectionStatus[] = [];
  manager.subscribe((s) => statuses.push(s));
  const notes: NoteEvent[] = [];
  manager.onNote((e) => notes.push(e));
  return { access, manager, statuses, notes };
}

describe('ConnectionManager over USB', () => {
  it('connects to the FP-10 and forwards its notes', async () => {
    const { access, manager, notes } = setup();
    access.inputs.set('a', new FakePort('a', 'Midi Through'));
    const fp10 = new FakePort('b', 'FP-10');
    access.inputs.set('b', fp10);
    await manager.startUsb(null);
    expect(manager.current).toEqual({ state: 'connected', kind: 'usb', name: 'FP-10' });
    fp10.play([0x90, 60, 127]);
    expect(notes).toMatchObject([{ type: 'on', pitch: 60, velocity: 1 }]);
  });

  it('sends output to the port with the same name', async () => {
    const { access, manager } = setup();
    const output = new FakePort('out', 'FP-10');
    access.inputs.set('in', new FakePort('in', 'FP-10'));
    access.outputs.set('out', output);
    await manager.startUsb(null);
    manager.send({ type: 'noteOn', pitch: 60, velocity: 90 });
    expect(output.sent).toEqual([[0x90, 60, 90]]);
  });

  it('notices unplug and replug', async () => {
    const { access, manager } = setup();
    const fp10 = new FakePort('b', 'FP-10');
    access.inputs.set('b', fp10);
    await manager.startUsb(null);
    fp10.unplug();
    expect(manager.current).toEqual({ state: 'disconnected', error: null });
    access.plug(new FakePort('c', 'FP-10'));
    expect(manager.current).toMatchObject({ state: 'connected', name: 'FP-10' });
  });

  it('waits for a device when none is plugged in', async () => {
    const { access, manager } = setup();
    await manager.startUsb(null);
    expect(manager.current).toEqual({ state: 'disconnected', error: null });
    access.plug(new FakePort('x', 'FP-10'));
    expect(manager.current.state).toBe('connected');
  });

  it('reports unsupported or denied MIDI', async () => {
    const unsupported = new ConnectionManager({
      requestMIDIAccess: () => Promise.reject(new MidiAccessError('midi-unsupported')),
    });
    await unsupported.startUsb(null);
    expect(unsupported.current).toEqual({ state: 'disconnected', error: 'midi-unsupported' });
    const denied = new ConnectionManager({ requestMIDIAccess: () => Promise.reject(new Error('nope')) });
    await denied.startUsb(null);
    expect(denied.current).toEqual({ state: 'disconnected', error: 'midi-denied' });
  });

  it('lets the user pick another input', async () => {
    const { access, manager } = setup();
    access.inputs.set('a', new FakePort('a', 'FP-10'));
    access.inputs.set('b', new FakePort('b', 'Other'));
    await manager.startUsb(null);
    expect(manager.listUsbInputs()).toEqual([
      { id: 'a', name: 'FP-10' },
      { id: 'b', name: 'Other' },
    ]);
    manager.selectUsbInput('b');
    expect(manager.current).toMatchObject({ state: 'connected', name: 'Other' });
  });
});

describe('ConnectionManager over Bluetooth', () => {
  function fakeBle(): MidiConnection & { emit(e: NoteEvent): void; drop(): void; sent: unknown[] } {
    const noteCbs = new Set<(e: NoteEvent) => void>();
    const dropCbs = new Set<() => void>();
    return {
      kind: 'ble',
      name: 'FP-10 BLE',
      sent: [],
      onNote(cb) {
        noteCbs.add(cb);
        return () => noteCbs.delete(cb);
      },
      onDisconnect(cb) {
        dropCbs.add(cb);
        return () => dropCbs.delete(cb);
      },
      send(e) {
        this.sent.push(e);
      },
      close: vi.fn(),
      emit(e) {
        for (const cb of noteCbs) cb(e);
      },
      drop() {
        for (const cb of dropCbs) cb();
      },
    };
  }

  it('connects on request and forwards notes', async () => {
    const ble = fakeBle();
    const manager = new ConnectionManager({ requestBle: async () => ble });
    const notes: NoteEvent[] = [];
    manager.onNote((e) => notes.push(e));
    await manager.connectBluetooth();
    expect(manager.current).toEqual({ state: 'connected', kind: 'ble', name: 'FP-10 BLE' });
    ble.emit({ type: 'on', pitch: 62, velocity: 0.5, timeMs: 1 });
    expect(notes).toHaveLength(1);
    ble.drop();
    expect(manager.current).toEqual({ state: 'disconnected', error: null });
  });

  it('shows no error when the user cancels the chooser', async () => {
    const manager = new ConnectionManager({
      requestBle: () => Promise.reject(new DOMException('cancelled', 'NotFoundError')),
    });
    await manager.connectBluetooth();
    expect(manager.current).toEqual({ state: 'disconnected', error: null });
  });

  it('reports unavailable Bluetooth and failed connections', async () => {
    const off = new ConnectionManager({ requestBle: () => Promise.reject(new BluetoothUnavailableError()) });
    await off.connectBluetooth();
    expect(off.current).toEqual({ state: 'disconnected', error: 'bluetooth-unsupported' });
    const failing = new ConnectionManager({ requestBle: () => Promise.reject(new Error('GATT')) });
    await failing.connectBluetooth();
    expect(failing.current).toEqual({ state: 'disconnected', error: 'bluetooth-failed' });
  });
});

describe('ConnectionManager virtual keyboard', () => {
  it('forwards on-screen notes to listeners', () => {
    const manager = new ConnectionManager({ requestMIDIAccess: () => Promise.reject(new Error()) });
    const notes: NoteEvent[] = [];
    manager.onNote((e) => notes.push(e));
    manager.emitVirtual({ type: 'on', pitch: 60, velocity: 0.8, timeMs: 5 });
    expect(notes).toEqual([{ type: 'on', pitch: 60, velocity: 0.8, timeMs: 5 }]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/midi-io
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/midi-io/web-midi.ts`:

```ts
import type { OutputEvent } from '../engine/types';
import { MidiOutputEncoder, decodeMidiMessage } from './messages';
import type { MidiConnection, NoteEvent } from './types';

/** Web MIDI timestamps share performance.now()'s base; fall back to now if a browser sends nonsense. */
export function eventTime(timeStamp: number, now: number): number {
  return Number.isFinite(timeStamp) && timeStamp > 0 && Math.abs(now - timeStamp) < 1000 ? timeStamp : now;
}

/** USB (or OS-paired) piano through the Web MIDI API. */
export class WebMidiConnection implements MidiConnection {
  readonly kind = 'usb' as const;
  readonly name: string;
  private noteListeners = new Set<(e: NoteEvent) => void>();
  private disconnectListeners = new Set<() => void>();
  private encoder = new MidiOutputEncoder();

  constructor(
    private readonly input: MIDIInput,
    private readonly output: MIDIOutput | null,
  ) {
    this.name = input.name || 'MIDI';
    input.onmidimessage = this.handleMessage;
    input.addEventListener('statechange', this.handleState);
  }

  onNote(cb: (e: NoteEvent) => void): () => void {
    this.noteListeners.add(cb);
    return () => {
      this.noteListeners.delete(cb);
    };
  }

  onDisconnect(cb: () => void): () => void {
    this.disconnectListeners.add(cb);
    return () => {
      this.disconnectListeners.delete(cb);
    };
  }

  send(event: OutputEvent): void {
    if (!this.output) return;
    for (const message of this.encoder.encode(event)) {
      try {
        this.output.send(message);
      } catch {
        // Port went away mid-send; the statechange handler reports it.
      }
    }
  }

  close(): void {
    this.input.onmidimessage = null;
    this.input.removeEventListener('statechange', this.handleState);
    this.noteListeners.clear();
    this.disconnectListeners.clear();
  }

  private handleMessage = (event: MIDIMessageEvent): void => {
    if (!event.data) return;
    const note = decodeMidiMessage(event.data, eventTime(event.timeStamp, performance.now()));
    if (note) for (const cb of this.noteListeners) cb(note);
  };

  private handleState = (): void => {
    if (this.input.state === 'disconnected') {
      for (const cb of [...this.disconnectListeners]) cb();
    }
  };
}
```

`src/midi-io/ble-midi.ts`:

```ts
import type { OutputEvent } from '../engine/types';
import {
  BLE_MIDI_CHARACTERISTIC,
  BLE_MIDI_SERVICE,
  MESSAGES_PER_PACKET,
  decodeBlePacket,
  encodeBlePacket,
} from './ble-packet';
import { MidiOutputEncoder, decodeMidiMessage } from './messages';
import type { MidiConnection, NoteEvent } from './types';

const RECONNECT_DELAYS_MS = [1000, 2000, 4000];

/** Piano connected directly from the page over Web Bluetooth (BLE-MIDI). */
export class BleMidiConnection implements MidiConnection {
  readonly kind = 'ble' as const;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private noteListeners = new Set<(e: NoteEvent) => void>();
  private disconnectListeners = new Set<() => void>();
  private encoder = new MidiOutputEncoder();
  private writes: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(private readonly device: BluetoothDevice) {}

  /** Opens Chrome's device chooser (BLE-MIDI devices only) and connects. Needs a user gesture. */
  static async request(bluetooth: Bluetooth): Promise<BleMidiConnection> {
    const device = await bluetooth.requestDevice({ filters: [{ services: [BLE_MIDI_SERVICE] }] });
    const connection = new BleMidiConnection(device);
    await connection.connect();
    device.addEventListener('gattserverdisconnected', connection.handleDisconnect);
    return connection;
  }

  get name(): string {
    return this.device.name || 'Bluetooth MIDI';
  }

  onNote(cb: (e: NoteEvent) => void): () => void {
    this.noteListeners.add(cb);
    return () => {
      this.noteListeners.delete(cb);
    };
  }

  onDisconnect(cb: () => void): () => void {
    this.disconnectListeners.add(cb);
    return () => {
      this.disconnectListeners.delete(cb);
    };
  }

  send(event: OutputEvent): void {
    const characteristic = this.characteristic;
    if (!characteristic) return;
    const messages = this.encoder.encode(event);
    for (let i = 0; i < messages.length; i += MESSAGES_PER_PACKET) {
      const packet = encodeBlePacket(messages.slice(i, i + MESSAGES_PER_PACKET), performance.now());
      // GATT allows one operation at a time: queue the writes.
      this.writes = this.writes
        .then(() => characteristic.writeValueWithoutResponse(packet))
        .catch(() => undefined);
    }
  }

  close(): void {
    this.closed = true;
    this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.handleValue);
    this.characteristic = null;
    this.device.gatt?.disconnect();
    this.noteListeners.clear();
    this.disconnectListeners.clear();
  }

  private async connect(): Promise<void> {
    const server = await this.device.gatt!.connect();
    const service = await server.getPrimaryService(BLE_MIDI_SERVICE);
    const characteristic = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);
    characteristic.addEventListener('characteristicvaluechanged', this.handleValue);
    await characteristic.startNotifications();
    this.characteristic = characteristic;
  }

  private handleValue = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const now = performance.now();
    const packet = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    for (const message of decodeBlePacket(packet)) {
      const note = decodeMidiMessage(message, now);
      if (note) for (const cb of this.noteListeners) cb(note);
    }
  };

  private handleDisconnect = async (): Promise<void> => {
    if (this.closed) return;
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.handleValue);
    this.characteristic = null;
    for (const delay of RECONNECT_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (this.closed) return;
      try {
        await this.connect();
        return;
      } catch {
        // Try again after the next delay.
      }
    }
    for (const cb of [...this.disconnectListeners]) cb();
  };
}
```

`src/midi-io/connection-manager.ts`:

```ts
import type { OutputEvent } from '../engine/types';
import { BleMidiConnection } from './ble-midi';
import { pickPreferredPort } from './messages';
import type { ConnectionError, ConnectionStatus, MidiConnection, NoteEvent } from './types';
import { WebMidiConnection } from './web-midi';

export class MidiAccessError extends Error {
  constructor(readonly code: 'midi-unsupported' | 'midi-denied') {
    super(code);
    this.name = 'MidiAccessError';
  }
}

export class BluetoothUnavailableError extends Error {
  constructor() {
    super('bluetooth-unsupported');
    this.name = 'BluetoothUnavailableError';
  }
}

export interface PortInfo {
  id: string;
  name: string;
}

export interface ConnectionDeps {
  requestMIDIAccess?: () => Promise<MIDIAccess>;
  requestBle?: () => Promise<MidiConnection>;
}

async function defaultRequestMIDIAccess(): Promise<MIDIAccess> {
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
    throw new MidiAccessError('midi-unsupported');
  }
  try {
    return await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    throw new MidiAccessError('midi-denied');
  }
}

async function defaultRequestBle(): Promise<MidiConnection> {
  const bluetooth = typeof navigator === 'undefined' ? undefined : navigator.bluetooth;
  if (!bluetooth) throw new BluetoothUnavailableError();
  const available = await bluetooth.getAvailability().catch(() => true);
  if (!available) throw new BluetoothUnavailableError();
  return BleMidiConnection.request(bluetooth);
}

/**
 * Owns the link to the piano: connects over USB automatically (and on hot-plug),
 * over Bluetooth on request, and merges in notes from the on-screen keyboard.
 */
export class ConnectionManager {
  private status: ConnectionStatus = { state: 'disconnected', error: null };
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private noteListeners = new Set<(e: NoteEvent) => void>();
  private access: MIDIAccess | null = null;
  private active: MidiConnection | null = null;
  private activeCleanup: Array<() => void> = [];
  private preferredName: string | null = null;
  private readonly requestAccess: () => Promise<MIDIAccess>;
  private readonly requestBle: () => Promise<MidiConnection>;

  constructor(deps: ConnectionDeps = {}) {
    this.requestAccess = deps.requestMIDIAccess ?? defaultRequestMIDIAccess;
    this.requestBle = deps.requestBle ?? defaultRequestBle;
  }

  /** Svelte-store compatible: calls cb now and on every change. */
  subscribe(cb: (s: ConnectionStatus) => void): () => void {
    cb(this.status);
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  get current(): ConnectionStatus {
    return this.status;
  }

  onNote(cb: (e: NoteEvent) => void): () => void {
    this.noteListeners.add(cb);
    return () => {
      this.noteListeners.delete(cb);
    };
  }

  /** Notes from the on-screen or PC keyboard. */
  emitVirtual(event: NoteEvent): void {
    this.dispatch(event);
  }

  send(event: OutputEvent): void {
    this.active?.send(event);
  }

  /** Asks for MIDI access, connects the best USB input and keeps watching for plug/unplug. */
  async startUsb(preferredName: string | null): Promise<void> {
    this.preferredName = preferredName;
    try {
      this.access = await this.requestAccess();
    } catch (e) {
      const error: ConnectionError = e instanceof MidiAccessError ? e.code : 'midi-denied';
      if (!this.active) this.setStatus({ state: 'disconnected', error });
      return;
    }
    this.access.onstatechange = () => this.syncUsb();
    this.syncUsb();
  }

  listUsbInputs(): PortInfo[] {
    return this.usbInputs().map((p) => ({ id: p.id, name: p.name || p.id }));
  }

  /** Name of the connected device, or null. */
  get deviceName(): string | null {
    return this.active?.name ?? null;
  }

  selectUsbInput(id: string): void {
    const input = this.access?.inputs.get(id);
    if (!input) return;
    this.preferredName = input.name || null;
    this.connectUsb(input);
  }

  /** Opens the Bluetooth chooser. Must be called from a user gesture. */
  async connectBluetooth(): Promise<void> {
    const previous = this.status;
    this.setStatus({ state: 'connecting', kind: 'ble' });
    try {
      this.attach(await this.requestBle());
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === 'NotFoundError';
      if (this.active) {
        this.setStatus(previous);
      } else {
        const error: ConnectionError | null = cancelled
          ? null
          : e instanceof BluetoothUnavailableError
            ? 'bluetooth-unsupported'
            : 'bluetooth-failed';
        this.setStatus({ state: 'disconnected', error });
      }
    }
  }

  disconnect(): void {
    this.detach();
    this.setStatus({ state: 'disconnected', error: null });
  }

  private usbInputs(): MIDIInput[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].filter((p) => p.state !== 'disconnected');
  }

  private syncUsb(): void {
    if (this.active) return;
    const input = pickPreferredPort(
      this.usbInputs().map((port) => ({ name: port.name || '', port })),
      this.preferredName,
    );
    if (input) this.connectUsb(input.port);
  }

  private connectUsb(input: MIDIInput): void {
    const outputs = [...(this.access?.outputs.values() ?? [])].filter((p) => p.state !== 'disconnected');
    const output =
      outputs.find((o) => o.name === input.name) ??
      pickPreferredPort(outputs.map((port) => ({ name: port.name || '', port })), this.preferredName)?.port ??
      null;
    this.attach(new WebMidiConnection(input, output));
  }

  private attach(connection: MidiConnection): void {
    this.detach();
    this.active = connection;
    this.activeCleanup = [
      connection.onNote((e) => this.dispatch(e)),
      connection.onDisconnect(() => {
        if (this.active !== connection) return;
        this.detach();
        this.setStatus({ state: 'disconnected', error: null });
        this.syncUsb();
      }),
    ];
    this.setStatus({ state: 'connected', kind: connection.kind, name: connection.name });
  }

  private detach(): void {
    for (const cleanup of this.activeCleanup) cleanup();
    this.activeCleanup = [];
    this.active?.close();
    this.active = null;
  }

  private dispatch(event: NoteEvent): void {
    for (const cb of this.noteListeners) cb(event);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const cb of this.statusListeners) cb(status);
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/midi-io
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/midi-io/web-midi.ts src/midi-io/ble-midi.ts src/midi-io/connection-manager.ts tests/midi-io/connection-manager.test.ts
git commit -m "feat(midi): connect the piano over USB and Bluetooth" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Keyboard layout and canvas renderer

Pure layout of the on-screen keyboard (fit to the song, at least two octaves, ending on white keys) and the Canvas 2D frame: dark background, darker lanes under black keys, loop shading, measure lines, falling notes (green right, blue left, darker on black keys, faded when not practised, grey accompaniment), hit line, keyboard with pressed colours and the wait-mode glow on expected keys.

**Files:**
- Create: `src/render/keyboard-layout.ts`
- Create: `src/render/colors.ts`
- Create: `src/render/renderer.ts`
- Test: `tests/render/render.test.ts`

**Interfaces:**
- Consumes: `PIANO_LOW`, `PIANO_HIGH` (Task 2), `PlayableNote`, `PlayRole` (Task 2), `KeyResult` (Task 4), `lowerBound` (Task 1), test helper `pn`.
- Produces: In `src/render/keyboard-layout.ts`: `KeyRect`, `KeyboardLayout`, `isBlack(pitch)`, `songRange(pitches, minSemitones = 24)`, `layoutKeyboard(low, high, width)`, `keyAt(layout, x, onBlackRow): number | null`. In `src/render/colors.ts`: `COLORS`. In `src/render/renderer.ts`: `VISIBLE_SECONDS = 3`, `FrameInput`, `Geometry`, `geometry(width, height, whiteWidth)`, `visibleRange(notes, songTime, maxDuration)`, `maxNoteDuration(notes)`, `drawFrame(ctx, input)`.

- [ ] **Step 1: Write the failing tests**

`tests/render/render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isBlack, keyAt, layoutKeyboard, songRange } from '../../src/render/keyboard-layout';
import { drawFrame, geometry, maxNoteDuration, visibleRange } from '../../src/render/renderer';
import { pn } from '../helpers/make-midi';

describe('keyboard layout', () => {
  it('knows black keys', () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlack)).toEqual([false, true, false, true, false, false, true]);
    expect(isBlack(22)).toBe(true);
  });

  it('lays out 88 keys with 52 white keys', () => {
    const layout = layoutKeyboard(21, 108, 520);
    expect(layout.keys).toHaveLength(88);
    expect(layout.whiteWidth).toBe(10);
    // C4 is the 24th white key from A0 (A0, B0 + 3 octaves of 7).
    expect(layout.byPitch.get(60)).toEqual({ pitch: 60, x: 230, width: 10, black: false });
    // C#4 straddles the C4/D4 boundary.
    expect(layout.byPitch.get(61)).toEqual({ pitch: 61, x: 237, width: 6, black: true });
  });

  it('lists white keys before black keys', () => {
    const layout = layoutKeyboard(60, 72, 80);
    const firstBlack = layout.keys.findIndex((k) => k.black);
    expect(layout.keys.slice(firstBlack).every((k) => k.black)).toBe(true);
  });

  it('finds the key under a point, black keys first on the upper row', () => {
    const layout = layoutKeyboard(60, 72, 80); // 8 white keys of 10 px
    expect(keyAt(layout, 9.5, true)).toBe(61);
    expect(keyAt(layout, 9.5, false)).toBe(60);
    expect(keyAt(layout, 15, true)).toBe(62);
    expect(keyAt(layout, 200, false)).toBeNull();
  });

  it('fits the range to the song, at least two octaves, ending on white keys', () => {
    expect(songRange([60, 64])).toEqual({ low: 50, high: 74 });
    expect(songRange([30, 100])).toEqual({ low: 29, high: 100 });
    expect(songRange([61, 90])).toEqual({ low: 60, high: 91 });
    expect(songRange([21, 22])).toEqual({ low: 21, high: 45 });
    expect(songRange([])).toEqual({ low: 48, high: 72 });
  });
});

describe('renderer helpers', () => {
  it('keeps the keyboard between 14% and 26% of the height', () => {
    expect(geometry(1000, 800, 10).keyboardHeight).toBe(112);
    expect(geometry(1000, 800, 100).keyboardHeight).toBe(208);
    expect(geometry(1000, 800, 30).keyboardHeight).toBe(150);
  });

  it('finds notes visible in the next 3 seconds, including long notes already sounding', () => {
    const notes = [pn(60, 0, 10), pn(62, 4, 1), pn(64, 5, 1), pn(65, 8.5, 1)];
    expect(visibleRange(notes, 5, maxNoteDuration(notes))).toEqual([0, 3]);
    expect(visibleRange(notes, 5.6, maxNoteDuration(notes))).toEqual([0, 4]);
  });
});

describe('drawFrame', () => {
  function recordingContext() {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return (...args: unknown[]) => {
          calls.push(`${String(prop)}:${String(target.fillStyle)}`);
          return prop === 'measureText' ? { width: 10 } : args;
        };
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }

  it('draws visible notes in their hand colour and lights pressed keys', () => {
    const { ctx, calls } = recordingContext();
    const notes = [pn(60, 1, 1, 'right'), pn(48, 1, 1, 'left'), pn(55, 1, 1, 'accompaniment')];
    drawFrame(ctx, {
      width: 800,
      height: 600,
      layout: layoutKeyboard(48, 72, 800),
      notes,
      maxDuration: 1,
      songTime: 0,
      practiced: new Set(['right']),
      showAccompaniment: false,
      pressed: new Map([[64, 'wrong']]),
      expected: new Set(),
      measures: [0, 2],
      loop: null,
      noteLabel: () => 'C4',
    });
    const fills = calls.filter((c) => c.startsWith('fill:'));
    expect(fills).toEqual(['fill:#4cc36a', 'fill:#3d8bfd']);
    expect(calls).toContain('fillText:rgba(255, 255, 255, 0.85)');
    expect(calls).toContain('fillRect:#ef4444');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/render
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/render/keyboard-layout.ts`:

```ts
import { PIANO_HIGH, PIANO_LOW } from '../song/parse';

export interface KeyRect {
  pitch: number;
  x: number;
  width: number;
  black: boolean;
}

export interface KeyboardLayout {
  low: number;
  high: number;
  whiteWidth: number;
  blackWidth: number;
  /** White keys first, then black keys (draw order). */
  keys: KeyRect[];
  byPitch: Map<number, KeyRect>;
}

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const BLACK_KEY_RATIO = 0.6;

export function isBlack(pitch: number): boolean {
  return BLACK_PITCH_CLASSES.has(((pitch % 12) + 12) % 12);
}

/**
 * Key range to show for a song: its lowest to highest pitch, widened to at
 * least `minSemitones`, inside the 88 keys, ending on white keys.
 */
export function songRange(pitches: Iterable<number>, minSemitones = 24): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const p of pitches) {
    low = Math.min(low, p);
    high = Math.max(high, p);
  }
  if (!Number.isFinite(low)) {
    low = 48;
    high = 72;
  }
  low = Math.max(PIANO_LOW, low);
  high = Math.min(PIANO_HIGH, high);
  while (high - low < minSemitones && (low > PIANO_LOW || high < PIANO_HIGH)) {
    if (low > PIANO_LOW) low--;
    if (high - low < minSemitones && high < PIANO_HIGH) high++;
  }
  if (isBlack(low)) low--;
  if (isBlack(high)) high++;
  return { low, high };
}

/** Positions every key from low to high (both white) across `width` pixels. */
export function layoutKeyboard(low: number, high: number, width: number): KeyboardLayout {
  let whiteCount = 0;
  for (let p = low; p <= high; p++) if (!isBlack(p)) whiteCount++;
  const whiteWidth = width / Math.max(1, whiteCount);
  const blackWidth = whiteWidth * BLACK_KEY_RATIO;

  const whites: KeyRect[] = [];
  const blacks: KeyRect[] = [];
  let whiteIndex = 0;
  for (let p = low; p <= high; p++) {
    if (isBlack(p)) {
      blacks.push({ pitch: p, x: whiteIndex * whiteWidth - blackWidth / 2, width: blackWidth, black: true });
    } else {
      whites.push({ pitch: p, x: whiteIndex * whiteWidth, width: whiteWidth, black: false });
      whiteIndex++;
    }
  }
  const keys = [...whites, ...blacks];
  return { low, high, whiteWidth, blackWidth, keys, byPitch: new Map(keys.map((k) => [k.pitch, k])) };
}

/** Key under an x position on the keyboard; black keys win in their upper part. */
export function keyAt(layout: KeyboardLayout, x: number, onBlackRow: boolean): number | null {
  if (onBlackRow) {
    for (let i = layout.keys.length - 1; i >= 0; i--) {
      const k = layout.keys[i];
      if (!k.black) break;
      if (x >= k.x && x < k.x + k.width) return k.pitch;
    }
  }
  for (const k of layout.keys) {
    if (!k.black && x >= k.x && x < k.x + k.width) return k.pitch;
  }
  return null;
}
```

`src/render/colors.ts`:

```ts
/** The play area is always dark, Synthesia-style. */
export const COLORS = {
  background: '#12141a',
  blackLane: '#0e1015',
  measureLine: 'rgba(255, 255, 255, 0.08)',
  loopShade: 'rgba(232, 195, 90, 0.07)',
  hitLine: '#e8c35a',
  right: '#4cc36a',
  rightDark: '#2f8f4a',
  left: '#3d8bfd',
  leftDark: '#2a62c0',
  accompaniment: '#6b7280',
  wrong: '#ef4444',
  neutral: '#a78bfa',
  expected: 'rgba(250, 204, 21, 0.6)',
  whiteKey: '#f4f4f5',
  whiteKeyEdge: '#9ca3af',
  blackKey: '#1c1c22',
  label: 'rgba(255, 255, 255, 0.85)',
} as const;
```

`src/render/renderer.ts`:

```ts
import type { KeyResult } from '../engine/types';
import type { PlayableNote, PlayRole } from '../song/types';
import { lowerBound } from '../util/bisect';
import { COLORS } from './colors';
import type { KeyboardLayout } from './keyboard-layout';

/** Song seconds visible above the keyboard. */
export const VISIBLE_SECONDS = 3;

export interface FrameInput {
  /** CSS pixels. */
  width: number;
  height: number;
  layout: KeyboardLayout;
  notes: readonly PlayableNote[];
  /** Longest note duration in `notes` (to find notes that started off-screen). */
  maxDuration: number;
  songTime: number;
  /** Roles the player is practising; other notes are drawn faded. Empty = none faded. */
  practiced: ReadonlySet<PlayRole>;
  showAccompaniment: boolean;
  pressed: ReadonlyMap<number, KeyResult>;
  expected: ReadonlySet<number>;
  measures: readonly number[];
  loop: { start: number; end: number } | null;
  /** Returns the label drawn inside falling notes, or null for no labels. */
  noteLabel: ((pitch: number) => string) | null;
}

export interface Geometry {
  keyboardTop: number;
  keyboardHeight: number;
  pxPerSecond: number;
}

export function geometry(width: number, height: number, whiteWidth: number): Geometry {
  const keyboardHeight = Math.round(Math.min(height * 0.26, Math.max(height * 0.14, whiteWidth * 5)));
  const keyboardTop = height - keyboardHeight;
  return { keyboardTop, keyboardHeight, pxPerSecond: keyboardTop / VISIBLE_SECONDS };
}

/** Index range [from, to) of notes visible at songTime. */
export function visibleRange(notes: readonly PlayableNote[], songTime: number, maxDuration: number): [number, number] {
  return [lowerBound(notes, songTime - maxDuration), lowerBound(notes, songTime + VISIBLE_SECONDS + 0.001)];
}

export function maxNoteDuration(notes: readonly PlayableNote[]): number {
  return notes.reduce((max, n) => Math.max(max, n.end - n.start), 0);
}

function noteColor(note: PlayableNote, black: boolean): string {
  if (note.role === 'accompaniment') return COLORS.accompaniment;
  if (note.role === 'left') return black ? COLORS.leftDark : COLORS.left;
  return black ? COLORS.rightDark : COLORS.right;
}

function keyColor(result: KeyResult): string {
  switch (result) {
    case 'right':
      return COLORS.right;
    case 'left':
      return COLORS.left;
    case 'wrong':
      return COLORS.wrong;
    case 'neutral':
      return COLORS.neutral;
  }
}

export function drawFrame(ctx: CanvasRenderingContext2D, input: FrameInput): void {
  const { width, height, layout, songTime } = input;
  const g = geometry(width, height, layout.whiteWidth);
  const yOf = (t: number) => g.keyboardTop - (t - songTime) * g.pxPerSecond;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Darker lanes under black keys.
  ctx.fillStyle = COLORS.blackLane;
  for (const k of layout.keys) if (k.black) ctx.fillRect(k.x, 0, k.width, g.keyboardTop);

  if (input.loop) {
    const top = Math.max(0, yOf(input.loop.end));
    const bottom = Math.min(g.keyboardTop, yOf(input.loop.start));
    if (bottom > top) {
      ctx.fillStyle = COLORS.loopShade;
      ctx.fillRect(0, top, width, bottom - top);
    }
  }

  ctx.fillStyle = COLORS.measureLine;
  for (const m of input.measures) {
    const y = yOf(m);
    if (y >= 0 && y <= g.keyboardTop) ctx.fillRect(0, Math.round(y), width, 1);
  }

  const [from, to] = visibleRange(input.notes, songTime, input.maxDuration);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = `600 ${Math.max(9, Math.min(13, layout.whiteWidth * 0.45))}px system-ui, sans-serif`;
  for (let i = from; i < to; i++) {
    const n = input.notes[i];
    if (n.end < songTime) continue;
    if (n.role === 'accompaniment' && !input.showAccompaniment) continue;
    const key = layout.byPitch.get(n.pitch);
    if (!key) continue;
    const top = yOf(n.end);
    const bottom = yOf(n.start);
    const h = Math.max(4, bottom - top);
    const faded = n.role === 'accompaniment' || (input.practiced.size > 0 && !input.practiced.has(n.role));
    ctx.globalAlpha = n.role === 'accompaniment' ? 0.45 : faded ? 0.35 : 1;
    ctx.fillStyle = noteColor(n, key.black);
    ctx.beginPath();
    ctx.roundRect(key.x + 1, bottom - h, key.width - 2, h, Math.min(5, key.width / 3));
    ctx.fill();
    if (input.noteLabel && !faded && h >= 16 && key.width >= 12) {
      ctx.fillStyle = COLORS.label;
      ctx.fillText(input.noteLabel(n.pitch), key.x + key.width / 2, bottom - 3);
    }
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.hitLine;
  ctx.fillRect(0, g.keyboardTop - 2, width, 2);

  drawKeyboard(ctx, input, g);
}

function drawKeyboard(ctx: CanvasRenderingContext2D, input: FrameInput, g: Geometry): void {
  const { layout, pressed, expected } = input;
  const blackHeight = g.keyboardHeight * 0.62;
  for (const k of layout.keys) {
    const h = k.black ? blackHeight : g.keyboardHeight;
    const result = pressed.get(k.pitch);
    ctx.fillStyle = result ? keyColor(result) : k.black ? COLORS.blackKey : COLORS.whiteKey;
    ctx.fillRect(k.x, g.keyboardTop, k.width, h);
    if (!k.black) {
      ctx.fillStyle = COLORS.whiteKeyEdge;
      ctx.fillRect(k.x + k.width - 1, g.keyboardTop, 1, h);
    }
    if (expected.has(k.pitch) && !result) {
      ctx.fillStyle = COLORS.expected;
      ctx.fillRect(k.x, g.keyboardTop, k.width, h);
    }
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/render
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/render/keyboard-layout.ts src/render/colors.ts src/render/renderer.ts tests/render/render.test.ts
git commit -m "feat(render): lay out the keyboard and draw falling notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Translations and settings

English (default) and Spanish dictionaries with identical keys and placeholders, `translate`, note names (C-D-E or Do-Re-Mi, automatic by language), and validated settings persisted in `localStorage` (every read/write in try/catch, invalid values fall back to defaults).

**Files:**
- Create: `src/i18n/en.ts`
- Create: `src/i18n/es.ts`
- Create: `src/i18n/index.ts`
- Create: `src/storage/settings.ts`
- Test: `tests/i18n/i18n.test.ts`
- Test: `tests/storage/settings.test.ts`

**Interfaces:**
- Consumes: `Mode` (Task 4).
- Produces: In `src/i18n/en.ts`: `en`, `type MessageKey`. In `src/i18n/es.ts`: `es`. In `src/i18n/index.ts`: `Language`, `NoteNameSetting`, `NoteNameStyle`, `Translate`, `LANGUAGES`, `LANGUAGE_NAMES`, `translate(lang, key, params?)`, `noteNameStyle(setting, lang)`, `noteName(pitch, style, withOctave = true)`. In `src/storage/settings.ts`: `HandChoice`, `Settings`, `DEFAULT_SETTINGS`, `loadSettings(storage?)`, `saveSettings(settings, storage?)`.

- [ ] **Step 1: Write the failing tests**

`tests/i18n/i18n.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { noteName, noteNameStyle, translate } from '../../src/i18n';
import { en } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';

describe('i18n', () => {
  it('has the same keys in English and Spanish, none empty', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(en), ...Object.values(es)]) expect(value.trim()).not.toBe('');
  });

  it('uses the same placeholders in both languages', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('translates and fills placeholders', () => {
    expect(translate('en', 'library.title')).toBe('Library');
    expect(translate('es', 'library.title')).toBe('Biblioteca');
    expect(translate('es', 'conn.connected', { name: 'FP-10' })).toBe('Conectado · FP-10');
    expect(translate('en', 'play.loopPass', { n: 2 })).toBe('Pass 2: {percent}%');
  });

  it('names notes in letters or solfège', () => {
    expect(noteName(60, 'letters')).toBe('C4');
    expect(noteName(61, 'solfege')).toBe('Do#4');
    expect(noteName(21, 'letters')).toBe('A0');
    expect(noteName(67, 'solfege', false)).toBe('Sol');
  });

  it('picks the note style from the language when automatic', () => {
    expect(noteNameStyle('auto', 'en')).toBe('letters');
    expect(noteNameStyle('auto', 'es')).toBe('solfege');
    expect(noteNameStyle('letters', 'es')).toBe('letters');
  });
});
```

`tests/storage/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/storage/settings';

describe('settings', () => {
  function memoryStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial));
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, v),
    };
  }

  it('defaults to English and sound on', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.language).toBe('en');
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    saveSettings({ ...DEFAULT_SETTINGS, language: 'es', volume: 0.3, lastHand: 'both' }, storage);
    expect(loadSettings(storage)).toMatchObject({ language: 'es', volume: 0.3, lastHand: 'both' });
  });

  it('ignores invalid values and corrupt data', () => {
    const bad = memoryStorage({
      'piano-professor.settings': JSON.stringify({ language: 'fr', volume: 7, soundOn: 'yes', lastSpeed: 0.5 }),
    });
    expect(loadSettings(bad)).toEqual({ ...DEFAULT_SETTINGS, lastSpeed: 0.5 });
    expect(loadSettings(memoryStorage({ 'piano-professor.settings': '{oops' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/i18n tests/storage/settings.test.ts
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/i18n/en.ts`:

```ts
export const en = {
  'app.title': 'Piano Professor',
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.rename': 'Rename',
  'common.yes': 'Yes',
  'common.no': 'No',

  'conn.connected': 'Connected · {name}',
  'conn.connecting': 'Connecting…',
  'conn.disconnected': 'No piano',
  'conn.usb': 'USB',
  'conn.bluetooth': 'Bluetooth',
  'conn.connectBluetooth': 'Connect via Bluetooth',
  'conn.retryUsb': 'Look for USB piano again',
  'conn.device': 'MIDI device',
  'conn.noDevices': 'No MIDI device found. Plug the piano in over USB or connect via Bluetooth.',
  'conn.bluetoothHint': 'Chrome asks again each time you open the app: tap the button once per session.',

  'error.midi-unsupported': 'This browser has no MIDI support. Open the app in Chrome.',
  'error.midi-denied': 'MIDI access is blocked. Allow it in the site settings (icon left of the address) and reload.',
  'error.bluetooth-unsupported': 'Bluetooth is not available. Use Chrome on Android with Bluetooth turned on.',
  'error.bluetooth-failed': 'Could not connect over Bluetooth. Check the piano is on and not connected to another app.',
  'error.invalidMidi': '"{name}" could not be read as MIDI.',
  'error.emptySong': '"{name}" has no notes to play.',
  'error.songMissing': 'This song could not be loaded.',

  'library.title': 'Library',
  'library.add': 'Add song',
  'library.empty': 'No songs yet. Add a .mid file to start.',
  'library.demo': 'Add demo song',
  'library.deleteConfirm': 'Delete "{title}" and its scores?',

  'setup.tracks': 'Tracks',
  'setup.track': 'Track {n}',
  'setup.trackInfo': '{count} notes · {low}–{high}',
  'setup.splitByPitch': 'Split hands by pitch',
  'setup.splitPoint': 'Right hand from {note} up',
  'setup.preview': 'Listen',
  'setup.hand': 'Hand',
  'setup.mode': 'Mode',
  'setup.speed': 'Speed',
  'setup.sound': 'Play the other parts on the piano',
  'setup.volume': 'Volume',
  'setup.listen': 'Listen to the song',
  'setup.stop': 'Stop',
  'setup.start': 'Start',

  'role.right': 'Right hand',
  'role.left': 'Left hand',
  'role.accompaniment': 'Accompaniment',
  'role.ignore': 'Ignore',

  'hand.right': 'Right',
  'hand.left': 'Left',
  'hand.both': 'Both',
  'hand.short.right': 'R',
  'hand.short.left': 'L',
  'hand.short.both': 'R+L',

  'mode.wait': 'Wait',
  'mode.tempo': 'Tempo',
  'mode.waitHint': 'The song waits until you play the right keys.',
  'mode.tempoHint': 'The song keeps its tempo and scores your timing.',

  'play.pause': 'Pause',
  'play.resume': 'Resume',
  'play.loop': 'A–B',
  'play.loopFrom': 'A',
  'play.loopTo': 'B',
  'play.loopPass': 'Pass {n}: {percent}%',
  'play.measure': 'Bar {n}',
  'play.restart': 'Restart',

  'results.title': 'Results',
  'results.cleanSteps': 'Clean steps',
  'results.wrongNotes': 'Wrong notes',
  'results.time': 'Time',
  'results.accuracy': 'Accuracy',
  'results.hits': 'Hits',
  'results.perfects': 'Perfect',
  'results.misses': 'Misses',
  'results.extras': 'Extra notes',
  'results.bestStreak': 'Best streak',
  'results.newBest': 'New best!',
  'results.best': 'Best: {percent}%',
  'results.notSaved': 'Runs with a loop or jumps are not saved.',
  'results.retry': 'Retry',
  'results.back': 'Back to library',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.noteNames': 'Note names',
  'settings.noteNames.auto': 'Automatic',
  'settings.noteNames.letters': 'C D E',
  'settings.noteNames.solfege': 'Do Re Mi',
  'settings.showNoteLabels': 'Show names on falling notes',
  'settings.showAccompaniment': 'Show accompaniment notes',
  'settings.keyboardRange': 'Keyboard',
  'settings.keyboardRange.song': 'Fit to song',
  'settings.keyboardRange.full': 'All 88 keys',
  'settings.connection': 'Piano connection',
  'settings.display': 'Display',
  'settings.sound': 'Sound',
} as const;

export type MessageKey = keyof typeof en;
```

`src/i18n/es.ts`:

```ts
import type { MessageKey } from './en';

export const es: Record<MessageKey, string> = {
  'app.title': 'Piano Professor',
  'common.back': 'Volver',
  'common.cancel': 'Cancelar',
  'common.save': 'Guardar',
  'common.delete': 'Borrar',
  'common.rename': 'Renombrar',
  'common.yes': 'Sí',
  'common.no': 'No',

  'conn.connected': 'Conectado · {name}',
  'conn.connecting': 'Conectando…',
  'conn.disconnected': 'Sin piano',
  'conn.usb': 'USB',
  'conn.bluetooth': 'Bluetooth',
  'conn.connectBluetooth': 'Conectar por Bluetooth',
  'conn.retryUsb': 'Buscar de nuevo el piano USB',
  'conn.device': 'Dispositivo MIDI',
  'conn.noDevices': 'No se encuentra ningún dispositivo MIDI. Conecta el piano por USB o por Bluetooth.',
  'conn.bluetoothHint': 'Chrome lo pide cada vez que abres la app: pulsa el botón una vez por sesión.',

  'error.midi-unsupported': 'Este navegador no tiene MIDI. Abre la app en Chrome.',
  'error.midi-denied':
    'El acceso MIDI está bloqueado. Permítelo en la configuración del sitio (icono a la izquierda de la dirección) y recarga.',
  'error.bluetooth-unsupported': 'Bluetooth no está disponible. Usa Chrome en Android con el Bluetooth activado.',
  'error.bluetooth-failed':
    'No se pudo conectar por Bluetooth. Comprueba que el piano está encendido y no conectado a otra app.',
  'error.invalidMidi': '"{name}" no se puede leer como MIDI.',
  'error.emptySong': '"{name}" no tiene notas para tocar.',
  'error.songMissing': 'No se pudo cargar esta canción.',

  'library.title': 'Biblioteca',
  'library.add': 'Añadir canción',
  'library.empty': 'Aún no hay canciones. Añade un archivo .mid para empezar.',
  'library.demo': 'Añadir canción de ejemplo',
  'library.deleteConfirm': '¿Borrar "{title}" y sus puntuaciones?',

  'setup.tracks': 'Pistas',
  'setup.track': 'Pista {n}',
  'setup.trackInfo': '{count} notas · {low}–{high}',
  'setup.splitByPitch': 'Separar manos por altura',
  'setup.splitPoint': 'Mano derecha desde {note} hacia arriba',
  'setup.preview': 'Escuchar',
  'setup.hand': 'Mano',
  'setup.mode': 'Modo',
  'setup.speed': 'Velocidad',
  'setup.sound': 'Tocar las otras partes en el piano',
  'setup.volume': 'Volumen',
  'setup.listen': 'Escuchar la canción',
  'setup.stop': 'Parar',
  'setup.start': 'Empezar',

  'role.right': 'Mano derecha',
  'role.left': 'Mano izquierda',
  'role.accompaniment': 'Acompañamiento',
  'role.ignore': 'Ignorar',

  'hand.right': 'Derecha',
  'hand.left': 'Izquierda',
  'hand.both': 'Ambas',
  'hand.short.right': 'D',
  'hand.short.left': 'I',
  'hand.short.both': 'D+I',

  'mode.wait': 'Espera',
  'mode.tempo': 'Con tempo',
  'mode.waitHint': 'La canción espera a que toques las teclas correctas.',
  'mode.tempoHint': 'La canción sigue su ritmo y puntúa tu precisión.',

  'play.pause': 'Pausa',
  'play.resume': 'Continuar',
  'play.loop': 'A–B',
  'play.loopFrom': 'A',
  'play.loopTo': 'B',
  'play.loopPass': 'Vuelta {n}: {percent}%',
  'play.measure': 'Compás {n}',
  'play.restart': 'Reiniciar',

  'results.title': 'Resultados',
  'results.cleanSteps': 'Pasos sin errores',
  'results.wrongNotes': 'Notas equivocadas',
  'results.time': 'Tiempo',
  'results.accuracy': 'Precisión',
  'results.hits': 'Aciertos',
  'results.perfects': 'Perfectos',
  'results.misses': 'Fallos',
  'results.extras': 'Notas de más',
  'results.bestStreak': 'Mejor racha',
  'results.newBest': '¡Nueva mejor marca!',
  'results.best': 'Mejor: {percent}%',
  'results.notSaved': 'Las partidas con bucle o saltos no se guardan.',
  'results.retry': 'Repetir',
  'results.back': 'Volver a la biblioteca',

  'settings.title': 'Ajustes',
  'settings.language': 'Idioma',
  'settings.noteNames': 'Nombres de notas',
  'settings.noteNames.auto': 'Automático',
  'settings.noteNames.letters': 'C D E',
  'settings.noteNames.solfege': 'Do Re Mi',
  'settings.showNoteLabels': 'Mostrar nombres en las notas',
  'settings.showAccompaniment': 'Mostrar notas de acompañamiento',
  'settings.keyboardRange': 'Teclado',
  'settings.keyboardRange.song': 'Ajustar a la canción',
  'settings.keyboardRange.full': 'Las 88 teclas',
  'settings.connection': 'Conexión del piano',
  'settings.display': 'Pantalla',
  'settings.sound': 'Sonido',
};
```

`src/i18n/index.ts`:

```ts
import { en, type MessageKey } from './en';
import { es } from './es';

export type { MessageKey };
export type Language = 'en' | 'es';
export type NoteNameSetting = 'auto' | 'letters' | 'solfege';
export type NoteNameStyle = 'letters' | 'solfege';
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export const LANGUAGES: readonly Language[] = ['en', 'es'];
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', es: 'Español' };

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, es };

export function translate(lang: Language, key: MessageKey, params?: Record<string, string | number>): string {
  const template = dictionaries[lang][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function noteNameStyle(setting: NoteNameSetting, lang: Language): NoteNameStyle {
  if (setting !== 'auto') return setting;
  return lang === 'es' ? 'solfege' : 'letters';
}

const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

/** "C4" / "Do4" for MIDI pitch 60 (scientific octave numbering). */
export function noteName(pitch: number, style: NoteNameStyle, withOctave = true): string {
  const names = style === 'letters' ? LETTERS : SOLFEGE;
  const name = names[((pitch % 12) + 12) % 12];
  return withOctave ? `${name}${Math.floor(pitch / 12) - 1}` : name;
}
```

`src/storage/settings.ts`:

```ts
import type { Mode } from '../engine/types';
import type { Language, NoteNameSetting } from '../i18n';

export type HandChoice = 'right' | 'left' | 'both';

export interface Settings {
  language: Language;
  noteNames: NoteNameSetting;
  showNoteLabels: boolean;
  showAccompaniment: boolean;
  keyboardRange: 'song' | 'full';
  soundOn: boolean;
  /** 0–1 */
  volume: number;
  /** Name of the last USB MIDI input chosen by hand. */
  preferredDevice: string | null;
  lastMode: Mode;
  lastHand: HandChoice;
  /** 0.25–1.5 */
  lastSpeed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  noteNames: 'auto',
  showNoteLabels: false,
  showAccompaniment: true,
  keyboardRange: 'song',
  soundOn: true,
  volume: 0.8,
  preferredDevice: null,
  lastMode: 'wait',
  lastHand: 'right',
  lastSpeed: 1,
};

const STORAGE_KEY = 'piano-professor.settings';

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const oneOf =
  <T>(...values: T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const inRange = (min: number, max: number) => (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

const validators: { [K in keyof Settings]: (v: unknown) => v is Settings[K] } = {
  language: oneOf<Language>('en', 'es'),
  noteNames: oneOf<NoteNameSetting>('auto', 'letters', 'solfege'),
  showNoteLabels: isBool,
  showAccompaniment: isBool,
  keyboardRange: oneOf<'song' | 'full'>('song', 'full'),
  soundOn: isBool,
  volume: inRange(0, 1),
  preferredDevice: (v: unknown): v is string | null => v === null || typeof v === 'string',
  lastMode: oneOf<Mode>('wait', 'tempo'),
  lastHand: oneOf<HandChoice>('right', 'left', 'both'),
  lastSpeed: inRange(0.25, 1.5),
};

/** Stored settings merged over the defaults; invalid or missing values fall back to defaults. */
export function loadSettings(storage: Storage | null = safeLocalStorage()): Settings {
  let stored: Record<string, unknown> = {};
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') stored = parsed as Record<string, unknown>;
  } catch {
    // Corrupt or unavailable storage: use defaults.
  }
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(validators) as (keyof Settings)[]) {
    const value = stored[key];
    if (validators[key](value)) (settings as Record<keyof Settings, unknown>)[key] = value;
  }
  return settings;
}

export function saveSettings(settings: Settings, storage: Storage | null = safeLocalStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: settings just won't persist.
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/i18n tests/storage/settings.test.ts
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/en.ts src/i18n/es.ts src/i18n/index.ts src/storage/settings.ts tests/i18n/i18n.test.ts tests/storage/settings.test.ts
git commit -m "feat: add English/Spanish translations and persisted settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Song library and scores in IndexedDB

IndexedDB (via `idb`) database `piano-professor` v1 with `songs` (original MIDI bytes, title, duration, hand config) and `scores` (best run + last 10 runs per song, hand and mode). Deleting a song deletes its scores in the same transaction.

**Files:**
- Create: `src/storage/db.ts`
- Create: `src/storage/songs.ts`
- Create: `src/storage/scores.ts`
- Test: `tests/storage/library.test.ts`

**Interfaces:**
- Consumes: `Mode`, `Score`, `emptyWaitScore` (Task 4), `HandConfig` (Task 2), `HandChoice` (Task 9).
- Produces: In `src/storage/db.ts`: `StoredSong`, `RunResult`, `ScoreRecord`, `type AppDb`, `openAppDb(name = 'piano-professor')`. In `src/storage/songs.ts`: `addSong(db, { title, fileName, bytes, duration })`, `listSongs(db)` (alphabetical), `getSong(db, id)`, `renameSong(db, id, title)`, `saveHandConfig(db, id, config)`, `deleteSong(db, id)`. In `src/storage/scores.ts`: `scoreKey(songId, hand, mode)`, `recordRun(db, songId, hand, mode, result): Promise<{ record; isNewBest }>`, `getScores(db, songId)`, `getScore(db, songId, hand, mode)`.

- [ ] **Step 1: Write the failing tests**

`tests/storage/library.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyWaitScore } from '../../src/engine/scoring';
import { openAppDb, type RunResult } from '../../src/storage/db';
import { getScore, getScores, recordRun } from '../../src/storage/scores';
import { addSong, deleteSong, getSong, listSongs, renameSong, saveHandConfig } from '../../src/storage/songs';

let dbCounter = 0;
const freshDb = () => openAppDb(`test-${dbCounter++}`);
const bytes = () => Uint8Array.from([1, 2, 3]).buffer;
const run = (percent: number, date = 1): RunResult => ({ date, speed: 1, percent, score: emptyWaitScore(4) });

describe('songs', () => {
  it('adds, lists alphabetically and reads back songs with their bytes', async () => {
    const db = await freshDb();
    await addSong(db, { title: 'Zeta', fileName: 'z.mid', bytes: bytes(), duration: 10 });
    const a = await addSong(db, { title: 'Alpha', fileName: 'a.mid', bytes: bytes(), duration: 5 });
    expect((await listSongs(db)).map((s) => s.title)).toEqual(['Alpha', 'Zeta']);
    const stored = await getSong(db, a.id);
    expect(stored).toMatchObject({ title: 'Alpha', fileName: 'a.mid', duration: 5, handConfig: null });
    expect(new Uint8Array(stored!.bytes)).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('renames (ignoring blank names) and saves hand configs', async () => {
    const db = await freshDb();
    const s = await addSong(db, { title: 'Old', fileName: 'o.mid', bytes: bytes(), duration: 1 });
    await renameSong(db, s.id, '  New  ');
    await renameSong(db, s.id, '   ');
    await saveHandConfig(db, s.id, { method: 'split', trackRoles: {}, splitPitch: 55 });
    expect(await getSong(db, s.id)).toMatchObject({
      title: 'New',
      handConfig: { method: 'split', splitPitch: 55 },
    });
  });

  it('deleting a song deletes its scores', async () => {
    const db = await freshDb();
    const s = await addSong(db, { title: 'A', fileName: 'a.mid', bytes: bytes(), duration: 1 });
    const keep = await addSong(db, { title: 'B', fileName: 'b.mid', bytes: bytes(), duration: 1 });
    await recordRun(db, s.id, 'right', 'wait', run(50));
    await recordRun(db, keep.id, 'right', 'wait', run(70));
    await deleteSong(db, s.id);
    expect(await getSong(db, s.id)).toBeUndefined();
    expect(await getScores(db, s.id)).toEqual([]);
    expect(await getScores(db, keep.id)).toHaveLength(1);
  });
});

describe('scores', () => {
  it('keeps the best run and the last 10 runs per song, hand and mode', async () => {
    const db = await freshDb();
    const first = await recordRun(db, 's', 'left', 'tempo', run(60, 1));
    expect(first.isNewBest).toBe(true);
    const worse = await recordRun(db, 's', 'left', 'tempo', run(40, 2));
    expect(worse.isNewBest).toBe(false);
    expect(worse.record.best.percent).toBe(60);
    for (let i = 3; i <= 12; i++) await recordRun(db, 's', 'left', 'tempo', run(10, i));
    const record = await getScore(db, 's', 'left', 'tempo');
    expect(record!.history).toHaveLength(10);
    expect(record!.history[0].date).toBe(12);
    expect(await getScore(db, 's', 'right', 'tempo')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/storage
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/storage/db.ts`:

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Mode, Score } from '../engine/types';
import type { HandConfig } from '../song/types';
import type { HandChoice } from './settings';

export interface StoredSong {
  id: string;
  title: string;
  fileName: string;
  bytes: ArrayBuffer;
  addedAt: number;
  /** Seconds. */
  duration: number;
  /** null until the user confirms or changes the automatic assignment. */
  handConfig: HandConfig | null;
}

export interface RunResult {
  date: number;
  speed: number;
  percent: number;
  score: Score;
}

export interface ScoreRecord {
  /** `${songId}|${hand}|${mode}` */
  key: string;
  songId: string;
  hand: HandChoice;
  mode: Mode;
  best: RunResult;
  /** Most recent first, at most 10. */
  history: RunResult[];
}

interface Schema extends DBSchema {
  songs: { key: string; value: StoredSong };
  scores: { key: string; value: ScoreRecord; indexes: { bySong: string } };
}

export type AppDb = IDBPDatabase<Schema>;

export function openAppDb(name = 'piano-professor'): Promise<AppDb> {
  return openDB<Schema>(name, 1, {
    upgrade(db) {
      db.createObjectStore('songs', { keyPath: 'id' });
      const scores = db.createObjectStore('scores', { keyPath: 'key' });
      scores.createIndex('bySong', 'songId');
    },
  });
}
```

`src/storage/songs.ts`:

```ts
import type { HandConfig } from '../song/types';
import type { AppDb, StoredSong } from './db';

export async function addSong(
  db: AppDb,
  input: { title: string; fileName: string; bytes: ArrayBuffer; duration: number },
): Promise<StoredSong> {
  const song: StoredSong = {
    id: crypto.randomUUID(),
    title: input.title,
    fileName: input.fileName,
    bytes: input.bytes,
    duration: input.duration,
    addedAt: Date.now(),
    handConfig: null,
  };
  await db.put('songs', song);
  return song;
}

/** All songs, alphabetically by title. */
export async function listSongs(db: AppDb): Promise<StoredSong[]> {
  const songs = await db.getAll('songs');
  return songs.sort((a, b) => a.title.localeCompare(b.title));
}

export function getSong(db: AppDb, id: string): Promise<StoredSong | undefined> {
  return db.get('songs', id);
}

export async function renameSong(db: AppDb, id: string, title: string): Promise<void> {
  const song = await db.get('songs', id);
  const trimmed = title.trim();
  if (!song || !trimmed) return;
  await db.put('songs', { ...song, title: trimmed });
}

export async function saveHandConfig(db: AppDb, id: string, handConfig: HandConfig): Promise<void> {
  const song = await db.get('songs', id);
  if (!song) return;
  await db.put('songs', { ...song, handConfig });
}

/** Deletes the song and all its scores in one transaction. */
export async function deleteSong(db: AppDb, id: string): Promise<void> {
  const tx = db.transaction(['songs', 'scores'], 'readwrite');
  const scores = tx.objectStore('scores');
  const keys = await scores.index('bySong').getAllKeys(id);
  await Promise.all([tx.objectStore('songs').delete(id), ...keys.map((k) => scores.delete(k)), tx.done]);
}
```

`src/storage/scores.ts`:

```ts
import type { Mode } from '../engine/types';
import type { AppDb, RunResult, ScoreRecord } from './db';
import type { HandChoice } from './settings';

const HISTORY_LIMIT = 10;

export function scoreKey(songId: string, hand: HandChoice, mode: Mode): string {
  return `${songId}|${hand}|${mode}`;
}

/** Stores a finished run; returns the updated record and whether it beat the previous best. */
export async function recordRun(
  db: AppDb,
  songId: string,
  hand: HandChoice,
  mode: Mode,
  result: RunResult,
): Promise<{ record: ScoreRecord; isNewBest: boolean }> {
  const key = scoreKey(songId, hand, mode);
  const tx = db.transaction('scores', 'readwrite');
  const existing = await tx.store.get(key);
  const isNewBest = !existing || result.percent > existing.best.percent;
  const record: ScoreRecord = {
    key,
    songId,
    hand,
    mode,
    best: isNewBest ? result : existing.best,
    history: [result, ...(existing?.history ?? [])].slice(0, HISTORY_LIMIT),
  };
  await tx.store.put(record);
  await tx.done;
  return { record, isNewBest };
}

export function getScores(db: AppDb, songId: string): Promise<ScoreRecord[]> {
  return db.getAllFromIndex('scores', 'bySong', songId);
}

export function getScore(db: AppDb, songId: string, hand: HandChoice, mode: Mode): Promise<ScoreRecord | undefined> {
  return db.get('scores', scoreKey(songId, hand, mode));
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/storage
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/storage/db.ts src/storage/songs.ts src/storage/scores.ts tests/storage/library.test.ts
git commit -m "feat(storage): keep songs and scores in IndexedDB" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: UI plumbing: app state, play controller and helpers

Everything the screens share, in plain TypeScript: Svelte stores for settings (auto-saved), translation and note naming; the connection singleton; the screen router state; label key maps; time/measure formatting; the PC-keyboard mapping for testing without a piano; song loading; the `Previewer` (plays notes on the piano without judging); and `PlayController`, which owns the session, the animation loop, canvas sizing (device pixel ratio), touch input on the drawn keyboard and PC-keyboard input.

**Files:**
- Create: `src/ui/format.ts`
- Create: `src/ui/pc-keyboard.ts`
- Create: `src/ui/labels.ts`
- Create: `src/ui/app-state.ts`
- Create: `src/ui/song-loader.ts`
- Create: `src/ui/previewer.ts`
- Create: `src/ui/play-controller.ts`
- Test: `tests/ui/ui-helpers.test.ts`

**Interfaces:**
- Consumes: Everything from Tasks 1–10.
- Produces: In `src/ui/app-state.ts`: `connection`, `connectionStatus`, `settings`, `t`, `nameNote`, `getDb()`, `interface PlayRequest { songId; hand; mode; speed }`, `type Screen`, `screen`. In `src/ui/labels.ts`: `HAND_KEYS`, `HAND_SHORT_KEYS`, `MODE_KEYS`, `ROLE_KEYS`, `ERROR_KEYS`, `NOTE_NAME_KEYS`. In `src/ui/format.ts`: `formatDuration(seconds)`, `measureAt(measures, t)`. In `src/ui/pc-keyboard.ts`: `pcKeyToPitch(code, basePitch)`, `shiftOctave(basePitch, direction)`, `OCTAVE_DOWN_KEY`, `OCTAVE_UP_KEY`, `DEFAULT_BASE_PITCH`. In `src/ui/song-loader.ts`: `LoadedSong`, `loadSong(songId): Promise<LoadedSong | null>`. In `src/ui/previewer.ts`: `class Previewer { playing; play(notes, measures, volume, onEnd); stop() }`. In `src/ui/play-controller.ts`: `DisplayOptions`, `class PlayController { constructor(canvas, notes, measures, config, connection, display, onFrame); start(); stop(); setDisplay(d); pause(); resume(); seek(t); setSpeed(s); setLoop(loop); setSound(on, volume); restart(changes, keepPosition) }`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/ui-helpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration, measureAt } from '../../src/ui/format';
import { pcKeyToPitch, shiftOctave } from '../../src/ui/pc-keyboard';

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(75.4)).toBe('1:15');
    expect(formatDuration(-3)).toBe('0:00');
  });
});

describe('measureAt', () => {
  const measures = [0, 2, 4, 6];
  it('finds the measure containing a time', () => {
    expect(measureAt(measures, -1)).toBe(0);
    expect(measureAt(measures, 0)).toBe(0);
    expect(measureAt(measures, 3.9)).toBe(1);
    expect(measureAt(measures, 4)).toBe(2);
    expect(measureAt(measures, 99)).toBe(2);
  });
});

describe('PC keyboard', () => {
  it('maps the home row to white keys and the row above to black keys', () => {
    expect(pcKeyToPitch('KeyA', 60)).toBe(60);
    expect(pcKeyToPitch('KeyW', 60)).toBe(61);
    expect(pcKeyToPitch('KeyJ', 60)).toBe(71);
    expect(pcKeyToPitch('Semicolon', 60)).toBe(76);
    expect(pcKeyToPitch('KeyQ', 60)).toBeNull();
  });

  it('stays inside the piano', () => {
    expect(pcKeyToPitch('KeyA', 12)).toBeNull();
    expect(shiftOctave(60, 1)).toBe(72);
    expect(shiftOctave(96, 1)).toBe(96);
    expect(shiftOctave(24, -1)).toBe(24);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
npx vitest run tests/ui
```

Expected: FAIL — the imported modules do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/ui/format.ts`:

```ts
/** 75 -> "1:15" */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/** Index of the measure containing song time t (0 before the song starts). */
export function measureAt(measures: readonly number[], t: number): number {
  let index = 0;
  for (let i = 0; i < measures.length - 1; i++) {
    if (measures[i] <= t) index = i;
    else break;
  }
  return index;
}
```

`src/ui/pc-keyboard.ts`:

```ts
// Desktop testing without a piano: the home row plays white keys, the row
// above plays black keys, Z / X shift the octave.

const KEY_OFFSETS: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
};

export const OCTAVE_DOWN_KEY = 'KeyZ';
export const OCTAVE_UP_KEY = 'KeyX';
export const DEFAULT_BASE_PITCH = 60;

/** Pitch for a KeyboardEvent.code with the home-row A on `basePitch`, or null. */
export function pcKeyToPitch(code: string, basePitch: number): number | null {
  const offset = KEY_OFFSETS[code];
  if (offset === undefined) return null;
  const pitch = basePitch + offset;
  return pitch >= 21 && pitch <= 108 ? pitch : null;
}

/** Moves the base by an octave, staying inside the piano. */
export function shiftOctave(basePitch: number, direction: -1 | 1): number {
  return Math.min(96, Math.max(24, basePitch + 12 * direction));
}
```

`src/ui/labels.ts`:

```ts
import type { Mode } from '../engine/types';
import type { MessageKey, NoteNameSetting } from '../i18n';
import type { ConnectionError } from '../midi-io/types';
import type { HandChoice } from '../storage/settings';
import type { Role } from '../song/types';

export const HAND_KEYS: Record<HandChoice, MessageKey> = {
  right: 'hand.right',
  left: 'hand.left',
  both: 'hand.both',
};

export const HAND_SHORT_KEYS: Record<HandChoice, MessageKey> = {
  right: 'hand.short.right',
  left: 'hand.short.left',
  both: 'hand.short.both',
};

export const MODE_KEYS: Record<Mode, MessageKey> = { wait: 'mode.wait', tempo: 'mode.tempo' };

export const ROLE_KEYS: Record<Role, MessageKey> = {
  right: 'role.right',
  left: 'role.left',
  accompaniment: 'role.accompaniment',
  ignore: 'role.ignore',
};

export const ERROR_KEYS: Record<ConnectionError, MessageKey> = {
  'midi-unsupported': 'error.midi-unsupported',
  'midi-denied': 'error.midi-denied',
  'bluetooth-unsupported': 'error.bluetooth-unsupported',
  'bluetooth-failed': 'error.bluetooth-failed',
};

export const NOTE_NAME_KEYS: Record<NoteNameSetting, MessageKey> = {
  auto: 'settings.noteNames.auto',
  letters: 'settings.noteNames.letters',
  solfege: 'settings.noteNames.solfege',
};
```

`src/ui/app-state.ts`:

```ts
import { derived, writable, type Readable } from 'svelte/store';
import type { Mode } from '../engine/types';
import { noteName, noteNameStyle, translate, type Translate } from '../i18n';
import { ConnectionManager } from '../midi-io/connection-manager';
import type { ConnectionStatus } from '../midi-io/types';
import { openAppDb, type AppDb } from '../storage/db';
import { loadSettings, saveSettings, type HandChoice, type Settings } from '../storage/settings';

export const connection = new ConnectionManager();

export const connectionStatus: Readable<ConnectionStatus> = {
  subscribe: (cb) => connection.subscribe(cb),
};

function createSettingsStore() {
  const store = writable<Settings>(loadSettings());
  store.subscribe((value) => saveSettings(value));
  return store;
}

export const settings = createSettingsStore();

export const t: Readable<Translate> = derived(
  settings,
  ($s): Translate =>
    (key, params) =>
      translate($s.language, key, params),
);

/** Note name in the user's chosen style. */
export const nameNote: Readable<(pitch: number, withOctave?: boolean) => string> = derived(settings, ($s) => {
  const style = noteNameStyle($s.noteNames, $s.language);
  return (pitch: number, withOctave = true) => noteName(pitch, style, withOctave);
});

let db: Promise<AppDb> | null = null;
export function getDb(): Promise<AppDb> {
  db ??= openAppDb();
  return db;
}

export interface PlayRequest {
  songId: string;
  hand: HandChoice;
  mode: Mode;
  speed: number;
}

export type Screen =
  | { name: 'library' }
  | { name: 'setup'; songId: string }
  | { name: 'play'; request: PlayRequest }
  | { name: 'settings'; back: Screen };

export const screen = writable<Screen>({ name: 'library' });
```

`src/ui/song-loader.ts`:

```ts
import { autoHandConfig } from '../song/hands';
import { parseSong } from '../song/parse';
import type { HandConfig, Song } from '../song/types';
import type { StoredSong } from '../storage/db';
import { getSong } from '../storage/songs';
import { getDb } from './app-state';

export interface LoadedSong {
  stored: StoredSong;
  song: Song;
  handConfig: HandConfig;
}

/** Reads a song from the library and parses it; null if it is gone or unreadable. */
export async function loadSong(songId: string): Promise<LoadedSong | null> {
  const stored = await getSong(await getDb(), songId);
  if (!stored) return null;
  try {
    const song = parseSong(stored.bytes, stored.fileName);
    song.title = stored.title;
    return { stored, song, handConfig: stored.handConfig ?? autoHandConfig(song) };
  } catch {
    return null;
  }
}
```

`src/ui/previewer.ts`:

```ts
import { PracticeSession } from '../engine/session';
import type { ConnectionManager } from '../midi-io/connection-manager';
import type { PlayableNote } from '../song/types';

/** Plays notes on the piano without judging (song or single-track preview). */
export class Previewer {
  private session: PracticeSession | null = null;
  private frame = 0;

  constructor(private readonly connection: ConnectionManager) {}

  get playing(): boolean {
    return this.session !== null;
  }

  play(notes: readonly PlayableNote[], measures: readonly number[], volume: number, onEnd: () => void): void {
    this.stop();
    if (notes.length === 0) {
      onEnd();
      return;
    }
    const now = performance.now();
    const session = new PracticeSession(
      notes,
      measures,
      { mode: 'tempo', practice: 'none', speed: 1, loop: null, soundOn: true, volume },
      now,
    );
    session.seek(notes[0].start - 0.05, now);
    this.session = session;
    const step = () => {
      session.tick(performance.now());
      for (const event of session.drainOutput()) this.connection.send(event);
      if (session.getState().status === 'finished') {
        this.stop();
        onEnd();
        return;
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    if (this.session) {
      this.session = null;
      this.connection.send({ type: 'allNotesOff' });
    }
  }
}
```

`src/ui/play-controller.ts`:

```ts
import { PracticeSession, practicedRoles } from '../engine/session';
import type { LoopRange, SessionConfig, SessionState } from '../engine/types';
import type { ConnectionManager } from '../midi-io/connection-manager';
import { PIANO_HIGH, PIANO_LOW } from '../song/parse';
import type { PlayableNote, PlayRole } from '../song/types';
import { geometry, drawFrame, maxNoteDuration } from '../render/renderer';
import { keyAt, layoutKeyboard, songRange, type KeyboardLayout } from '../render/keyboard-layout';
import { DEFAULT_BASE_PITCH, OCTAVE_DOWN_KEY, OCTAVE_UP_KEY, pcKeyToPitch, shiftOctave } from './pc-keyboard';

export interface DisplayOptions {
  showAccompaniment: boolean;
  keyboardRange: 'song' | 'full';
  noteLabel: ((pitch: number) => string) | null;
}

/**
 * Runs the play screen: owns the practice session, the animation loop,
 * the canvas and every input source (piano, touch, PC keyboard).
 */
export class PlayController {
  private session: PracticeSession;
  private frame = 0;
  private layout: KeyboardLayout | null = null;
  private cssWidth = 0;
  private cssHeight = 0;
  private readonly maxDuration: number;
  private practiced: Set<PlayRole>;
  private pointers = new Map<number, number>();
  private pcHeld = new Map<string, number>();
  private basePitch = DEFAULT_BASE_PITCH;
  private cleanups: Array<() => void> = [];
  private display: DisplayOptions;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly notes: readonly PlayableNote[],
    private readonly measures: readonly number[],
    private config: SessionConfig,
    private readonly connection: ConnectionManager,
    display: DisplayOptions,
    private readonly onFrame: (state: SessionState) => void,
  ) {
    this.display = display;
    this.maxDuration = maxNoteDuration(notes);
    this.practiced = practicedRoles(config.practice);
    this.session = new PracticeSession(notes, measures, config, performance.now());
  }

  start(): void {
    this.cleanups.push(
      this.connection.onNote((e) => {
        if (e.type === 'on') this.session.noteOn(e.pitch, e.velocity, e.timeMs);
        else this.session.noteOff(e.pitch, e.timeMs);
        this.flush();
      }),
    );
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(this.canvas);
    this.cleanups.push(() => resize.disconnect());
    this.listen(this.canvas, 'pointerdown', this.onPointerDown);
    this.listen(this.canvas, 'pointerup', this.onPointerUp);
    this.listen(this.canvas, 'pointercancel', this.onPointerUp);
    this.listen(window, 'keydown', this.onKeyDown);
    this.listen(window, 'keyup', this.onKeyUp);
    this.resize();
    const loop = () => {
      this.session.tick(performance.now());
      this.flush();
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.connection.send({ type: 'allNotesOff' });
  }

  setDisplay(display: DisplayOptions): void {
    const rangeChanged = display.keyboardRange !== this.display.keyboardRange;
    this.display = display;
    if (rangeChanged) this.resize();
  }

  pause(): void {
    this.session.pause(performance.now());
    this.flush();
  }

  resume(): void {
    this.session.resume(performance.now());
  }

  seek(songTime: number): void {
    this.session.seek(songTime, performance.now());
    this.flush();
  }

  setSpeed(speed: number): void {
    this.session.setSpeed(speed, performance.now());
    this.config = { ...this.config, speed: this.session.getState().speed };
  }

  setLoop(loop: LoopRange | null): void {
    this.session.setLoop(loop, performance.now());
    this.config = { ...this.config, loop };
    this.flush();
  }

  setSound(soundOn: boolean, volume: number): void {
    this.session.setSound(soundOn, volume);
    this.config = { ...this.config, soundOn, volume };
    this.flush();
  }

  /** Starts a fresh session with new settings (hand change or retry). */
  restart(changes: Partial<SessionConfig>, keepPosition: boolean): void {
    const position = this.session.getState().songTime;
    this.connection.send({ type: 'allNotesOff' });
    this.config = { ...this.config, ...changes };
    this.practiced = practicedRoles(this.config.practice);
    const now = performance.now();
    this.session = new PracticeSession(this.notes, this.measures, this.config, now);
    if (keepPosition && !this.config.loop) this.session.seek(position, now);
    this.flush();
  }

  private flush(): void {
    for (const event of this.session.drainOutput()) this.connection.send(event);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    const range =
      this.display.keyboardRange === 'full'
        ? { low: PIANO_LOW, high: PIANO_HIGH }
        : songRange(this.notes.map((n) => n.pitch));
    this.layout = layoutKeyboard(range.low, range.high, rect.width);
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    const state = this.session.getState();
    this.onFrame(state);
    if (!ctx || !this.layout || this.cssWidth === 0) return;
    const dpr = this.canvas.width / this.cssWidth;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const loop = state.loop;
    drawFrame(ctx, {
      width: this.cssWidth,
      height: this.cssHeight,
      layout: this.layout,
      notes: this.notes,
      maxDuration: this.maxDuration,
      songTime: state.songTime,
      practiced: this.practiced,
      showAccompaniment: this.display.showAccompaniment,
      pressed: state.pressed,
      expected: state.expected,
      measures: this.measures,
      loop: loop
        ? {
            start: this.measures[Math.min(loop.startMeasure, this.measures.length - 2)],
            end: this.measures[Math.min(loop.endMeasure + 1, this.measures.length - 1)],
          }
        : null,
      noteLabel: this.display.noteLabel,
    });
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window,
    type: K,
    handler: (e: HTMLElementEventMap[K]) => void,
  ): void {
    target.addEventListener(type, handler as EventListener);
    this.cleanups.push(() => target.removeEventListener(type, handler as EventListener));
  }

  private virtual(type: 'on' | 'off', pitch: number): void {
    this.connection.emitVirtual({ type, pitch, velocity: 0.8, timeMs: performance.now() });
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.layout) return;
    const rect = this.canvas.getBoundingClientRect();
    const { keyboardTop, keyboardHeight } = geometry(this.cssWidth, this.cssHeight, this.layout.whiteWidth);
    const y = e.clientY - rect.top;
    if (y < keyboardTop) return;
    const pitch = keyAt(this.layout, e.clientX - rect.left, y < keyboardTop + keyboardHeight * 0.62);
    if (pitch === null) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, pitch);
    this.virtual('on', pitch);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const pitch = this.pointers.get(e.pointerId);
    if (pitch === undefined) return;
    this.pointers.delete(e.pointerId);
    this.virtual('off', pitch);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === OCTAVE_DOWN_KEY || e.code === OCTAVE_UP_KEY) {
      this.basePitch = shiftOctave(this.basePitch, e.code === OCTAVE_UP_KEY ? 1 : -1);
      return;
    }
    const pitch = pcKeyToPitch(e.code, this.basePitch);
    if (pitch === null || this.pcHeld.has(e.code)) return;
    this.pcHeld.set(e.code, pitch);
    this.virtual('on', pitch);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const pitch = this.pcHeld.get(e.code);
    if (pitch === undefined) return;
    this.pcHeld.delete(e.code);
    this.virtual('off', pitch);
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run tests/ui
```

Expected: PASS, every test green.

- [ ] **Step 5: Run the whole suite and the type check**

```bash
npm test && npm run check
```

Expected: all tests pass; svelte-check 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/ui/format.ts src/ui/pc-keyboard.ts src/ui/labels.ts src/ui/app-state.ts src/ui/song-loader.ts src/ui/previewer.ts src/ui/play-controller.ts tests/ui/ui-helpers.test.ts
git commit -m "feat(ui): add app state, play controller and UI helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Screens: library, song setup, play, results, settings

The Svelte 5 screens (runes: `$props`, `$state`, `$derived`, `$effect`; stores read with `$store`). All text goes through `$t(...)`. This replaces the placeholder `src/ui/App.svelte`. Touch targets are at least 44–48 px. Browser dialogs (`alert`/`confirm`/`prompt`) are never used: rename and delete confirm inline.

**Files:**
- Create: `src/ui/components/ConnectionBadge.svelte`
- Create: `src/ui/components/Segmented.svelte`
- Create: `src/ui/components/ResultsOverlay.svelte`
- Create: `src/ui/screens/Library.svelte`
- Create: `src/ui/screens/SongSetup.svelte`
- Create: `src/ui/screens/Play.svelte`
- Create: `src/ui/screens/Settings.svelte`
- Create: `src/ui/App.svelte`

**Interfaces:**
- Consumes: Everything from Task 11 plus the domain modules.
- Produces: `src/ui/App.svelte` (router + USB auto-connect on mount), `src/ui/components/{ConnectionBadge,Segmented,ResultsOverlay}.svelte`, `src/ui/screens/{Library,SongSetup,Play,Settings}.svelte`.

- [ ] **Step 1: Write `src/ui/components/ConnectionBadge.svelte`**

`src/ui/components/ConnectionBadge.svelte`:

```svelte
<script lang="ts">
  import { connectionStatus, screen, t } from '../app-state';

  let { compact = false }: { compact?: boolean } = $props();

  const label = $derived(
    $connectionStatus.state === 'connected'
      ? $t('conn.connected', { name: $connectionStatus.name })
      : $connectionStatus.state === 'connecting'
        ? $t('conn.connecting')
        : $t('conn.disconnected'),
  );

  function openSettings() {
    screen.update((current) => ({ name: 'settings', back: current }));
  }
</script>

<button class="badge ghost" class:compact onclick={openSettings} title={label} aria-label={label}>
  <span class="dot {$connectionStatus.state}"></span>
  {#if !compact}<span class="text">{label}</span>{/if}
</button>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 260px;
  }
  .badge.compact {
    padding: 0 14px;
  }
  .text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .dot {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--danger);
  }
  .dot.connected {
    background: var(--ok);
  }
  .dot.connecting {
    background: var(--accent);
  }
</style>
```

- [ ] **Step 2: Write `src/ui/components/Segmented.svelte`**

`src/ui/components/Segmented.svelte`:

```svelte
<script lang="ts" generics="T extends string">
  let {
    options,
    value,
    onchange,
    label,
  }: {
    options: { value: T; label: string }[];
    value: T;
    onchange: (value: T) => void;
    label: string;
  } = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <button
      role="radio"
      aria-checked={option.value === value}
      class:selected={option.value === value}
      onclick={() => onchange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    justify-self: start;
    width: fit-content;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  button {
    border: none;
    border-radius: 0;
    background: var(--surface-2);
  }
  button + button {
    border-left: 1px solid var(--border);
  }
  button.selected {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
  }
</style>
```

- [ ] **Step 3: Write `src/ui/components/ResultsOverlay.svelte`**

`src/ui/components/ResultsOverlay.svelte`:

```svelte
<script lang="ts">
  import { scorePercent } from '../../engine/scoring';
  import type { Score } from '../../engine/types';
  import { t } from '../app-state';
  import { formatDuration } from '../format';

  let {
    score,
    saved,
    isNewBest,
    bestPercent,
    onretry,
    onback,
  }: {
    score: Score;
    /** False for runs with a loop or jumps. */
    saved: boolean;
    isNewBest: boolean;
    bestPercent: number | null;
    onretry: () => void;
    onback: () => void;
  } = $props();

  const percent = $derived(scorePercent(score));
</script>

<div class="backdrop">
  <div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="results-title">
    <h2 id="results-title">{$t('results.title')}</h2>
    <p class="percent">{percent}%</p>
    <p class="caption dim">{$t(score.kind === 'wait' ? 'results.cleanSteps' : 'results.accuracy')}</p>
    {#if saved && isNewBest}
      <p class="best">{$t('results.newBest')}</p>
    {:else if saved && bestPercent !== null}
      <p class="dim">{$t('results.best', { percent: bestPercent })}</p>
    {:else if !saved}
      <p class="dim">{$t('results.notSaved')}</p>
    {/if}

    <dl>
      {#if score.kind === 'wait'}
        <dt>{$t('results.cleanSteps')}</dt>
        <dd>{score.cleanSteps} / {score.totalSteps}</dd>
        <dt>{$t('results.wrongNotes')}</dt>
        <dd>{score.wrongNotes}</dd>
        <dt>{$t('results.time')}</dt>
        <dd>{formatDuration(score.elapsedMs / 1000)}</dd>
      {:else}
        <dt>{$t('results.hits')}</dt>
        <dd>{score.hits}</dd>
        <dt>{$t('results.perfects')}</dt>
        <dd>{score.perfects}</dd>
        <dt>{$t('results.misses')}</dt>
        <dd>{score.misses}</dd>
        <dt>{$t('results.extras')}</dt>
        <dd>{score.extras}</dd>
        <dt>{$t('results.bestStreak')}</dt>
        <dd>{score.bestStreak}</dd>
      {/if}
    </dl>

    <div class="buttons">
      <button onclick={onback}>{$t('results.back')}</button>
      <button class="primary" onclick={onretry}>{$t('results.retry')}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
    padding: 16px;
  }
  .dialog {
    width: min(420px, 100%);
    text-align: center;
  }
  h2 {
    margin: 0;
  }
  .percent {
    font-size: 3.5rem;
    font-weight: 800;
    margin: 8px 0 0;
  }
  .caption {
    margin: 0 0 8px;
  }
  .best {
    color: var(--accent);
    font-weight: 700;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 16px;
    text-align: left;
    margin: 16px 0;
  }
  dd {
    margin: 0;
    font-weight: 600;
    text-align: right;
  }
  .buttons {
    display: flex;
    gap: 10px;
    justify-content: center;
  }
</style>
```

- [ ] **Step 4: Write `src/ui/screens/Library.svelte`**

`src/ui/screens/Library.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { buildDemoMidi, DEMO_FILE_NAME } from '../../song/demo';
  import { parseSong, SongParseError } from '../../song/parse';
  import type { ScoreRecord, StoredSong } from '../../storage/db';
  import { getScores } from '../../storage/scores';
  import { addSong, deleteSong, listSongs, renameSong } from '../../storage/songs';
  import { getDb, screen, t } from '../app-state';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import { formatDuration } from '../format';
  import { HAND_SHORT_KEYS, MODE_KEYS } from '../labels';

  let songs = $state<StoredSong[]>([]);
  let scores = $state<Record<string, ScoreRecord[]>>({});
  let errors = $state<string[]>([]);
  let loaded = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let deletingId = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement>();

  async function refresh() {
    const db = await getDb();
    songs = await listSongs(db);
    const entries = await Promise.all(songs.map(async (s) => [s.id, await getScores(db, s.id)] as const));
    scores = Object.fromEntries(entries);
    loaded = true;
  }

  onMount(() => {
    void refresh();
  });

  /** Adds one file; returns an error message or null. */
  async function importFile(name: string, bytes: ArrayBuffer): Promise<string | null> {
    try {
      const song = parseSong(bytes, name);
      await addSong(await getDb(), { title: song.title, fileName: name, bytes, duration: song.duration });
      void navigator.storage?.persist?.();
      return null;
    } catch (e) {
      if (e instanceof SongParseError && e.code === 'empty') return $t('error.emptySong', { name });
      return $t('error.invalidMidi', { name });
    }
  }

  async function onFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    const results = await Promise.all(files.map(async (f) => importFile(f.name, await f.arrayBuffer())));
    errors = results.filter((r): r is string => r !== null);
    await refresh();
  }

  async function addDemo() {
    const result = await importFile(DEMO_FILE_NAME, new Uint8Array(buildDemoMidi()).buffer);
    errors = result ? [result] : [];
    await refresh();
  }

  function startRename(song: StoredSong) {
    deletingId = null;
    renamingId = song.id;
    renameValue = song.title;
  }

  async function confirmRename() {
    if (renamingId) await renameSong(await getDb(), renamingId, renameValue);
    renamingId = null;
    await refresh();
  }

  async function confirmDelete(id: string) {
    await deleteSong(await getDb(), id);
    deletingId = null;
    await refresh();
  }

  function bestScores(id: string): ScoreRecord[] {
    return [...(scores[id] ?? [])].sort((a, b) => b.best.percent - a.best.percent).slice(0, 3);
  }
</script>

<main class="screen">
  <header class="screen-header">
    <h1>{$t('app.title')}</h1>
    <ConnectionBadge />
  </header>

  <div class="actions">
    <button class="primary" onclick={() => fileInput?.click()}>＋ {$t('library.add')}</button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".mid,.midi,audio/midi,audio/x-midi"
      multiple
      hidden
      onchange={onFiles}
    />
  </div>

  {#each errors as error (error)}
    <p class="error">{error}</p>
  {/each}

  {#if loaded && songs.length === 0}
    <div class="card empty">
      <p>{$t('library.empty')}</p>
      <button onclick={addDemo}>{$t('library.demo')}</button>
    </div>
  {/if}

  <ul class="songs">
    {#each songs as song (song.id)}
      <li class="card">
        {#if renamingId === song.id}
          <form
            class="row"
            onsubmit={(e) => {
              e.preventDefault();
              void confirmRename();
            }}
          >
            <!-- svelte-ignore a11y_autofocus -->
            <input type="text" bind:value={renameValue} autofocus />
            <button class="primary" type="submit">{$t('common.save')}</button>
            <button type="button" onclick={() => (renamingId = null)}>{$t('common.cancel')}</button>
          </form>
        {:else if deletingId === song.id}
          <div class="row">
            <span class="grow">{$t('library.deleteConfirm', { title: song.title })}</span>
            <button class="danger" onclick={() => confirmDelete(song.id)}>{$t('common.delete')}</button>
            <button onclick={() => (deletingId = null)}>{$t('common.cancel')}</button>
          </div>
        {:else}
          <div class="row">
            <button class="open ghost grow" onclick={() => screen.set({ name: 'setup', songId: song.id })}>
              <span class="title">{song.title}</span>
              <span class="meta dim">{formatDuration(song.duration)}</span>
              {#each bestScores(song.id) as record (record.key)}
                <span class="chip">
                  {$t(HAND_SHORT_KEYS[record.hand])} · {$t(MODE_KEYS[record.mode])}
                  {record.best.percent}%
                </span>
              {/each}
            </button>
            <button class="ghost" onclick={() => startRename(song)} aria-label={$t('common.rename')}>✎</button>
            <button
              class="ghost"
              onclick={() => {
                renamingId = null;
                deletingId = song.id;
              }}
              aria-label={$t('common.delete')}>🗑</button
            >
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</main>

<style>
  .actions {
    margin-bottom: 16px;
  }
  .empty {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    justify-content: space-between;
  }
  .empty p {
    margin: 0;
  }
  .songs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .songs li {
    padding: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row input {
    flex: 1;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .open {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    border: none;
    text-align: left;
    padding: 8px 12px;
  }
  .title {
    font-weight: 600;
    font-size: 1.1rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip {
    font-size: 0.8rem;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
</style>
```

- [ ] **Step 5: Write `src/ui/screens/SongSetup.svelte`**

`src/ui/screens/SongSetup.svelte`:

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Mode } from '../../engine/types';
  import { applyHandConfig, autoHandConfig } from '../../song/hands';
  import type { HandConfig, Role, Song } from '../../song/types';
  import type { HandChoice } from '../../storage/settings';
  import { saveHandConfig } from '../../storage/songs';
  import { connection, getDb, nameNote, screen, settings, t } from '../app-state';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { HAND_KEYS, MODE_KEYS, ROLE_KEYS } from '../labels';
  import { Previewer } from '../previewer';
  import { loadSong } from '../song-loader';

  let { songId }: { songId: string } = $props();

  const ROLES: Role[] = ['right', 'left', 'accompaniment', 'ignore'];
  const HANDS: HandChoice[] = ['right', 'left', 'both'];
  const MODES: Mode[] = ['wait', 'tempo'];

  let song = $state<Song | null>(null);
  let handConfig = $state<HandConfig | null>(null);
  let failed = $state(false);
  let hand = $state<HandChoice>($settings.lastHand);
  let mode = $state<Mode>($settings.lastMode);
  let speedPercent = $state(Math.round($settings.lastSpeed * 100));
  /** 'song', a track index, or null when nothing is playing. */
  let previewing = $state<'song' | number | null>(null);
  const previewer = new Previewer(connection);

  onMount(async () => {
    const loaded = await loadSong(songId);
    if (!loaded) {
      failed = true;
      return;
    }
    song = loaded.song;
    handConfig = loaded.handConfig;
  });

  onDestroy(() => previewer.stop());

  async function updateConfig(next: HandConfig) {
    handConfig = next;
    await saveHandConfig(await getDb(), songId, $state.snapshot(next) as HandConfig);
  }

  function setTrackRole(track: number, role: Role) {
    if (!handConfig) return;
    void updateConfig({ ...handConfig, trackRoles: { ...handConfig.trackRoles, [track]: role } });
  }

  function setSplit(enabled: boolean) {
    if (!handConfig || !song) return;
    const tracks = enabled ? handConfig.trackRoles : autoHandConfig(song).trackRoles;
    void updateConfig({ ...handConfig, method: enabled ? 'split' : 'tracks', trackRoles: tracks });
  }

  function togglePreview(target: 'song' | number) {
    if (!song || !handConfig) return;
    if (previewing === target) {
      previewer.stop();
      previewing = null;
      return;
    }
    const all = applyHandConfig(song, $state.snapshot(handConfig) as HandConfig);
    const notes =
      target === 'song'
        ? all
        : song.notes.filter((n) => n.track === target).map((n) => ({ ...n, role: 'right' as const }));
    previewing = target;
    previewer.play(notes, song.measures, $settings.volume, () => (previewing = null));
  }

  function trackRange(track: number): { low: number; high: number } {
    let low = 127;
    let high = 0;
    for (const n of song?.notes ?? []) {
      if (n.track !== track) continue;
      low = Math.min(low, n.pitch);
      high = Math.max(high, n.pitch);
    }
    return { low, high };
  }

  function start() {
    previewer.stop();
    const speed = speedPercent / 100;
    settings.update((s) => ({ ...s, lastHand: hand, lastMode: mode, lastSpeed: speed }));
    screen.set({ name: 'play', request: { songId, hand, mode, speed } });
  }
</script>

<main class="screen">
  <header class="screen-header">
    <button class="ghost" onclick={() => screen.set({ name: 'library' })} aria-label={$t('common.back')}>←</button>
    <h1>{song?.title ?? ''}</h1>
    <ConnectionBadge />
  </header>

  {#if failed}
    <p class="error">{$t('error.songMissing')}</p>
  {:else if song && handConfig}
    <div class="layout">
      <section class="card">
        <h2>{$t('setup.tracks')}</h2>
        {#if song.tracks.length > 1}
          <label class="check">
            <input
              type="checkbox"
              checked={handConfig.method === 'split'}
              onchange={(e) => setSplit(e.currentTarget.checked)}
            />
            {$t('setup.splitByPitch')}
          </label>
        {/if}

        {#if handConfig.method === 'split'}
          <label class="field">
            <span>{$t('setup.splitPoint', { note: $nameNote(handConfig.splitPitch) })}</span>
            <input
              type="range"
              min="36"
              max="84"
              value={handConfig.splitPitch}
              onchange={(e) => void updateConfig({ ...handConfig!, splitPitch: Number(e.currentTarget.value) })}
            />
          </label>
        {:else}
          <ul class="tracks">
            {#each song.tracks as track (track.index)}
              <li>
                <div class="track-name">
                  <strong>{track.name || $t('setup.track', { n: track.index + 1 })}</strong>
                  <span class="dim">
                    {$t('setup.trackInfo', {
                      count: track.noteCount,
                      low: $nameNote(trackRange(track.index).low),
                      high: $nameNote(trackRange(track.index).high),
                    })}
                  </span>
                </div>
                <select
                  value={handConfig.trackRoles[track.index] ?? 'accompaniment'}
                  onchange={(e) => setTrackRole(track.index, e.currentTarget.value as Role)}
                >
                  {#each ROLES as role (role)}
                    <option value={role}>{$t(ROLE_KEYS[role])}</option>
                  {/each}
                </select>
                <button onclick={() => togglePreview(track.index)}>
                  {previewing === track.index ? '■' : '▶'}
                  <span class="sr">{$t('setup.preview')}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="card options">
        <div class="field">
          <span>{$t('setup.hand')}</span>
          <Segmented
            label={$t('setup.hand')}
            options={HANDS.map((h) => ({ value: h, label: $t(HAND_KEYS[h]) }))}
            value={hand}
            onchange={(v) => (hand = v)}
          />
        </div>
        <div class="field">
          <span>{$t('setup.mode')}</span>
          <Segmented
            label={$t('setup.mode')}
            options={MODES.map((m) => ({ value: m, label: $t(MODE_KEYS[m]) }))}
            value={mode}
            onchange={(v) => (mode = v)}
          />
          <small class="dim">{$t(mode === 'wait' ? 'mode.waitHint' : 'mode.tempoHint')}</small>
        </div>
        <label class="field">
          <span>{$t('setup.speed')}: {speedPercent}%</span>
          <input type="range" min="25" max="150" step="5" bind:value={speedPercent} />
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={$settings.soundOn} />
          {$t('setup.sound')}
        </label>
        <label class="field">
          <span>{$t('setup.volume')}: {Math.round($settings.volume * 100)}%</span>
          <input type="range" min="0" max="1" step="0.05" bind:value={$settings.volume} />
        </label>
        <div class="buttons">
          <button onclick={() => togglePreview('song')}>
            {previewing === 'song' ? $t('setup.stop') : $t('setup.listen')}
          </button>
          <button class="primary" onclick={start}>{$t('setup.start')} ▶</button>
        </div>
      </section>
    </div>
  {/if}
</main>

<style>
  .layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    align-items: start;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }
  .tracks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .tracks li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .track-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .options {
    display: grid;
    gap: 18px;
  }
  .field {
    display: grid;
    gap: 8px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--tap);
  }
  .buttons {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
```

- [ ] **Step 6: Write `src/ui/screens/Play.svelte`**

`src/ui/screens/Play.svelte`:

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { scorePercent } from '../../engine/scoring';
  import type { LoopRange, Score, SessionState, Status } from '../../engine/types';
  import { applyHandConfig } from '../../song/hands';
  import type { Song } from '../../song/types';
  import { recordRun } from '../../storage/scores';
  import type { HandChoice } from '../../storage/settings';
  import { connection, getDb, nameNote, screen, settings, t, type PlayRequest } from '../app-state';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import ResultsOverlay from '../components/ResultsOverlay.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { formatDuration, measureAt } from '../format';
  import { HAND_SHORT_KEYS } from '../labels';
  import { PlayController, type DisplayOptions } from '../play-controller';
  import { loadSong } from '../song-loader';

  let { request }: { request: PlayRequest } = $props();

  const HANDS: HandChoice[] = ['right', 'left', 'both'];

  let canvas = $state<HTMLCanvasElement>();
  let song = $state<Song | null>(null);
  let failed = $state(false);
  let controller: PlayController | null = null;
  // svelte-ignore state_referenced_locally
  let hand = $state<HandChoice>(request.hand);
  let songTime = $state(0);
  let status = $state<Status>('playing');
  // svelte-ignore state_referenced_locally
  let speed = $state(request.speed);
  let loop = $state<LoopRange | null>(null);
  let loopPass = $state(0);
  let lastLoopScore = $state<Score | null>(null);
  let results = $state<{ score: Score; saved: boolean; isNewBest: boolean; bestPercent: number | null } | null>(
    null,
  );
  let wakeLock: WakeLockSentinel | null = null;

  const measureCount = $derived(song ? song.measures.length - 1 : 0);

  function display(): DisplayOptions {
    return {
      showAccompaniment: $settings.showAccompaniment,
      keyboardRange: $settings.keyboardRange,
      noteLabel: $settings.showNoteLabels ? (p: number) => $nameNote(p, false) : null,
    };
  }

  function onFrame(state: SessionState) {
    songTime = state.songTime;
    speed = state.speed;
    loopPass = state.loopPass;
    lastLoopScore = state.lastLoopScore;
    if (state.status !== status) {
      status = state.status;
      if (status === 'finished' && state.score) void finish(state.score, state.complete);
    }
  }

  async function finish(score: Score, complete: boolean) {
    const snapshot = { ...score };
    const percent = scorePercent(snapshot);
    if (!complete) {
      results = { score: snapshot, saved: false, isNewBest: false, bestPercent: null };
      return;
    }
    const { record, isNewBest } = await recordRun(await getDb(), request.songId, hand, request.mode, {
      date: Date.now(),
      speed,
      percent,
      score: snapshot,
    });
    results = { score: snapshot, saved: true, isNewBest, bestPercent: record.best.percent };
  }

  async function requestWakeLock() {
    try {
      wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      wakeLock = null;
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void requestWakeLock();
    else controller?.pause();
  }

  onMount(async () => {
    const loaded = await loadSong(request.songId);
    if (!loaded || !canvas) {
      failed = true;
      return;
    }
    song = loaded.song;
    const notes = applyHandConfig(loaded.song, loaded.handConfig);
    controller = new PlayController(
      canvas,
      notes,
      loaded.song.measures,
      {
        mode: request.mode,
        practice: hand,
        speed: request.speed,
        loop: null,
        soundOn: $settings.soundOn,
        volume: $settings.volume,
      },
      connection,
      display(),
      onFrame,
    );
    controller.start();
    void requestWakeLock();
    document.addEventListener('visibilitychange', onVisibility);
  });

  onDestroy(() => {
    controller?.stop();
    document.removeEventListener('visibilitychange', onVisibility);
    void wakeLock?.release().catch(() => undefined);
  });

  $effect(() => {
    controller?.setSound($settings.soundOn, $settings.volume);
    controller?.setDisplay(display());
  });

  function togglePause() {
    if (status === 'paused') controller?.resume();
    else controller?.pause();
  }

  function changeSpeed(delta: number) {
    controller?.setSpeed(Math.round((speed + delta) * 100) / 100);
  }

  function changeHand(next: HandChoice) {
    hand = next;
    results = null;
    controller?.restart({ practice: next }, true);
  }

  function toggleLoop() {
    if (!song) return;
    if (loop) {
      loop = null;
    } else {
      const start = measureAt(song.measures, Math.max(0, songTime));
      loop = { startMeasure: start, endMeasure: Math.min(measureCount - 1, start + 3) };
    }
    controller?.setLoop(loop);
  }

  function moveLoop(edge: 'start' | 'end', delta: number) {
    if (!loop) return;
    let { startMeasure, endMeasure } = loop;
    if (edge === 'start') startMeasure = Math.min(endMeasure, Math.max(0, startMeasure + delta));
    else endMeasure = Math.max(startMeasure, Math.min(measureCount - 1, endMeasure + delta));
    loop = { startMeasure, endMeasure };
    controller?.setLoop(loop);
  }

  function seekFromBar(event: MouseEvent) {
    if (!song) return;
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    results = null;
    controller?.seek(fraction * song.duration);
  }

  function retry() {
    results = null;
    controller?.restart({}, false);
  }

  const progress = $derived(song && song.duration > 0 ? Math.min(1, Math.max(0, songTime / song.duration)) : 0);
  const loopStyle = $derived.by(() => {
    if (!loop || !song || song.duration <= 0) return '';
    const start = song.measures[loop.startMeasure] / song.duration;
    const end = Math.min(1, song.measures[loop.endMeasure + 1] / song.duration);
    return `left:${start * 100}%;width:${(end - start) * 100}%`;
  });
</script>

<div class="play">
  <header class="bar">
    <button class="ghost" onclick={() => screen.set({ name: 'setup', songId: request.songId })} aria-label={$t('common.back')}
      >←</button
    >
    <button onclick={togglePause} aria-label={status === 'paused' ? $t('play.resume') : $t('play.pause')}>
      {status === 'paused' ? '▶' : '❚❚'}
    </button>

    <div class="progress" role="presentation" onclick={seekFromBar}>
      {#if loopStyle}<div class="loop-zone" style={loopStyle}></div>{/if}
      <div class="fill" style="width:{progress * 100}%"></div>
    </div>
    <span class="time">{formatDuration(Math.min(song?.duration ?? 0, Math.max(0, songTime)))} / {formatDuration(song?.duration ?? 0)}</span>

    <div class="group">
      <button onclick={() => changeSpeed(-0.05)} disabled={speed <= 0.25} aria-label="−5%">−</button>
      <span class="value">{Math.round(speed * 100)}%</span>
      <button onclick={() => changeSpeed(0.05)} disabled={speed >= 1.5} aria-label="+5%">+</button>
    </div>

    <Segmented
      label={$t('setup.hand')}
      options={HANDS.map((h) => ({ value: h, label: $t(HAND_SHORT_KEYS[h]) }))}
      value={hand}
      onchange={changeHand}
    />

    <div class="group">
      <button class:active={loop !== null} onclick={toggleLoop}>{$t('play.loop')}</button>
      {#if loop}
        <span class="dim">{$t('play.loopFrom')}</span>
        <button onclick={() => moveLoop('start', -1)}>−</button>
        <span class="value">{loop.startMeasure + 1}</span>
        <button onclick={() => moveLoop('start', 1)}>+</button>
        <span class="dim">{$t('play.loopTo')}</span>
        <button onclick={() => moveLoop('end', -1)}>−</button>
        <span class="value">{loop.endMeasure + 1}</span>
        <button onclick={() => moveLoop('end', 1)}>+</button>
        {#if loopPass > 0 && lastLoopScore}
          <span class="pass">{$t('play.loopPass', { n: loopPass, percent: scorePercent(lastLoopScore) })}</span>
        {/if}
      {/if}
    </div>

    <ConnectionBadge compact />
  </header>

  <div class="stage">
    <canvas bind:this={canvas}></canvas>
    {#if failed}
      <p class="error message">{$t('error.songMissing')}</p>
    {/if}
    {#if results}
      <ResultsOverlay
        score={results.score}
        saved={results.saved}
        isNewBest={results.isNewBest}
        bestPercent={results.bestPercent}
        onretry={retry}
        onback={() => screen.set({ name: 'library' })}
      />
    {/if}
  </div>
</div>

<style>
  .play {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #12141a;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left));
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .bar button {
    min-height: 44px;
    padding: 0 12px;
  }
  .progress {
    position: relative;
    flex: 1 1 160px;
    height: 14px;
    border-radius: 7px;
    background: var(--surface-2);
    cursor: pointer;
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--accent);
    opacity: 0.85;
  }
  .loop-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(232, 195, 90, 0.35);
  }
  .time {
    font-variant-numeric: tabular-nums;
    min-width: 92px;
    text-align: center;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .value {
    min-width: 40px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .active {
    background: var(--accent);
    color: var(--accent-text);
  }
  .pass {
    margin-left: 6px;
    color: var(--accent);
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .message {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
  }
</style>
```

- [ ] **Step 7: Write `src/ui/screens/Settings.svelte`**

`src/ui/screens/Settings.svelte`:

```svelte
<script lang="ts">
  import { LANGUAGE_NAMES, LANGUAGES, type Language, type NoteNameSetting } from '../../i18n';
  import type { PortInfo } from '../../midi-io/connection-manager';
  import { connection, connectionStatus, screen, settings, t, type Screen } from '../app-state';
  import ConnectionBadge from '../components/ConnectionBadge.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { ERROR_KEYS, NOTE_NAME_KEYS } from '../labels';

  let { back }: { back: Screen } = $props();

  const NOTE_NAMES: NoteNameSetting[] = ['auto', 'letters', 'solfege'];

  let inputs = $state<PortInfo[]>([]);

  $effect(() => {
    // Re-read the device list whenever the connection changes.
    void $connectionStatus;
    inputs = connection.listUsbInputs();
  });

  function selectInput(id: string) {
    const port = inputs.find((p) => p.id === id);
    connection.selectUsbInput(id);
    if (port) settings.update((s) => ({ ...s, preferredDevice: port.name }));
  }

  const connectedName = $derived($connectionStatus.state === 'connected' ? $connectionStatus.name : '');
</script>

<main class="screen">
  <header class="screen-header">
    <button class="ghost" onclick={() => screen.set(back)} aria-label={$t('common.back')}>←</button>
    <h1>{$t('settings.title')}</h1>
  </header>

  <div class="sections">
    <section class="card">
      <h2>{$t('settings.connection')}</h2>
      <div class="row"><ConnectionBadge /></div>
      {#if $connectionStatus.state === 'disconnected' && $connectionStatus.error}
        <p class="error">{$t(ERROR_KEYS[$connectionStatus.error])}</p>
      {/if}

      {#if inputs.length > 0}
        <label class="field">
          <span>{$t('conn.device')} ({$t('conn.usb')})</span>
          <select
            value={inputs.find((p) => p.name === connectedName)?.id ?? ''}
            onchange={(e) => selectInput(e.currentTarget.value)}
          >
            <option value="" disabled>—</option>
            {#each inputs as input (input.id)}
              <option value={input.id}>{input.name}</option>
            {/each}
          </select>
        </label>
      {:else}
        <p class="dim">{$t('conn.noDevices')}</p>
      {/if}

      <div class="row">
        <button onclick={() => connection.startUsb($settings.preferredDevice)}>{$t('conn.retryUsb')}</button>
        <button onclick={() => connection.connectBluetooth()}>{$t('conn.connectBluetooth')}</button>
      </div>
      <p class="dim small">{$t('conn.bluetoothHint')}</p>
    </section>

    <section class="card">
      <h2>{$t('settings.display')}</h2>
      <label class="field">
        <span>{$t('settings.language')}</span>
        <select bind:value={$settings.language}>
          {#each LANGUAGES as lang (lang)}
            <option value={lang}>{LANGUAGE_NAMES[lang as Language]}</option>
          {/each}
        </select>
      </label>
      <div class="field">
        <span>{$t('settings.noteNames')}</span>
        <Segmented
          label={$t('settings.noteNames')}
          options={NOTE_NAMES.map((n) => ({ value: n, label: $t(NOTE_NAME_KEYS[n]) }))}
          value={$settings.noteNames}
          onchange={(v) => ($settings.noteNames = v)}
        />
      </div>
      <div class="field">
        <span>{$t('settings.keyboardRange')}</span>
        <Segmented
          label={$t('settings.keyboardRange')}
          options={[
            { value: 'song' as const, label: $t('settings.keyboardRange.song') },
            { value: 'full' as const, label: $t('settings.keyboardRange.full') },
          ]}
          value={$settings.keyboardRange}
          onchange={(v) => ($settings.keyboardRange = v)}
        />
      </div>
      <label class="check">
        <input type="checkbox" bind:checked={$settings.showNoteLabels} />
        {$t('settings.showNoteLabels')}
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={$settings.showAccompaniment} />
        {$t('settings.showAccompaniment')}
      </label>
    </section>

    <section class="card">
      <h2>{$t('settings.sound')}</h2>
      <label class="check">
        <input type="checkbox" bind:checked={$settings.soundOn} />
        {$t('setup.sound')}
      </label>
      <label class="field">
        <span>{$t('setup.volume')}: {Math.round($settings.volume * 100)}%</span>
        <input type="range" min="0" max="1" step="0.05" bind:value={$settings.volume} />
      </label>
    </section>
  </div>
</main>

<style>
  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
    align-items: start;
  }
  section {
    display: grid;
    gap: 14px;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .field {
    display: grid;
    gap: 8px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--tap);
  }
  .small {
    font-size: 0.85rem;
    margin: 0;
  }
  p {
    margin: 0;
  }
</style>
```

- [ ] **Step 8: Replace `src/ui/App.svelte`**

`src/ui/App.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { connection, screen, settings } from './app-state';
  import Library from './screens/Library.svelte';
  import Play from './screens/Play.svelte';
  import Settings from './screens/Settings.svelte';
  import SongSetup from './screens/SongSetup.svelte';

  onMount(() => {
    void connection.startUsb($settings.preferredDevice);
  });

  $effect(() => {
    document.documentElement.lang = $settings.language;
  });
</script>

{#if $screen.name === 'library'}
  <Library />
{:else if $screen.name === 'setup'}
  {#key $screen.songId}
    <SongSetup songId={$screen.songId} />
  {/key}
{:else if $screen.name === 'play'}
  <Play request={$screen.request} />
{:else if $screen.name === 'settings'}
  <Settings back={$screen.back} />
{/if}
```

- [ ] **Step 9: Type-check, test and build**

```bash
npm run check && npm test && npm run build
```

Expected: 0 errors and 0 warnings, all tests pass, build succeeds.

- [ ] **Step 10: Smoke-test in the browser**

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173 and check: empty library shows "Add demo song"; adding it lists "Ode to Joy (Beethoven) 0:19"; opening it shows two tracks (Right hand / Left hand) and options; **Start** shows falling notes and stops at the first note with its key glowing; pressing `D` on the PC keyboard (E4) continues; in Tempo mode the results overlay appears at the end; Settings → Language → Español translates the screens. No console errors.

- [ ] **Step 11: Commit**

```bash
git add src/ui/components/ConnectionBadge.svelte src/ui/components/Segmented.svelte src/ui/components/ResultsOverlay.svelte src/ui/screens/Library.svelte src/ui/screens/SongSetup.svelte src/ui/screens/Play.svelte src/ui/screens/Settings.svelte src/ui/App.svelte
git commit -m "feat(ui): add library, setup, play, results and settings screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: README and GitHub Pages deployment

User and developer documentation (with the manual tablet + FP-10 checklist) and the GitHub Actions workflow that checks, tests, builds and deploys `dist/` to GitHub Pages on every push to `main`. Do not create a GitHub repository or push: that is the user's decision.

**Files:**
- Create: `README.md`
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: npm scripts from Task 1.
- Produces: `README.md`, `.github/workflows/deploy.yml`.

- [ ] **Step 1: Write `README.md`**

`README.md`:

````markdown
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
     tap once per session.
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
````

- [ ] **Step 2: Write `.github/workflows/deploy.yml`**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Verify**

```bash
npm run check && npm test && npm run build
```

Expected: all green (the workflow file is not executed locally).

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/deploy.yml
git commit -m "docs: add README and GitHub Pages deploy workflow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
