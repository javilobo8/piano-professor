# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole Piano Professor UI to the chosen "Neón moderno" direction (night blue, violet→cyan gradient, glass cards, Plus Jakarta Sans), make every screen work on phones (portrait and landscape) and tablets, and turn Play and Free play into immersive full-screen canvases with floating glass controls.

**Architecture:** A token-based design system in `src/app.css` plus a few shared Svelte components (`AppHeader`, `Sheet`, restyled `Segmented`/`ConnectionBadge`/`SoundOutputField`, `ViewControls` as an inline section), two small pure helpers (`idle-dimmer`, `latestPractice`), a restyled canvas palette and drawing in `src/render/`, and per-screen rewrites of markup and styles. Engine, MIDI, audio and zoom logic do not change.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite 8 + vite-plugin-pwa (Workbox), Canvas 2D, Vitest (node env), `@lucide/svelte@1.48.0`, `@fontsource-variable/plus-jakarta-sans@5.3.0`.

**Spec:** `docs/superpowers/specs/2026-10-14-ui-redesign-design.md` (Spanish; binding). Read §2 (tokens and base elements) before any UI task.

## Global Constraints

- Design tokens and canvas palette: use the exact values of spec §2.1 and §4.6 — no new colours outside them except transparent variants of the same hues.
- Breakpoints: phone `< 600px`, tablet `600–1023px`, wide `≥ 1024px` (CSS width). Sheet: bottom sheet `< 720px`, floating panel otherwise.
- No horizontal scroll and nothing clipped at 360×640, 390×844, 844×390, 800×1280, 1280×800.
- Touch targets ≥ 44×44 px (`--tap-sm`), primary actions 48 px (`--tap`).
- `:hover` styles only inside `@media (hover: hover)`; `:focus-visible` ring 2 px `--cyan` with 2 px offset; `prefers-reduced-motion: reduce` disables transitions/animations.
- Icons only from `@lucide/svelte` (per-icon imports, e.g. `import Play from '@lucide/svelte/icons/play'`), `aria-hidden="true"`; every icon-only button has an `aria-label` (and `title`) from i18n. No emoji or symbol glyphs as icons (⚙ ✎ 🗑 🎹 ▶ ■ ❚❚ ＋ ← ⋯).
- Canvas: no `shadowBlur`, no gradients or other objects created per note or per frame; gradients are created once per geometry and cached.
- Every user-visible string goes through `$t(...)`; add new keys to both `src/i18n/en.ts` and `src/i18n/es.ts` (the i18n test checks parity).
- Keep behaviour unchanged: every current feature (hands, modes, speed, loop, listen, results, zoom/follow, previews, rename/delete, connection, settings) still works with the same semantics.
- Dependencies: add with exact versions using `pnpm add -E` (node_modules is a pnpm layout — never run plain `npm install`), then run `npm install --package-lock-only` so the committed `package-lock.json` (used by CI) matches. Never commit `pnpm-lock.yaml` (it stays untracked).
- Verification per task: `npm test` (all green), `npm run check` (0 errors, 0 warnings), `npm run build` (succeeds). Implementers do not drive a browser; the coordinating session checks visuals in Chrome after UI tasks.
- Commit messages end with a blank line then `Co-Authored-By:` naming the model that wrote the commit.

## Review Focus

1. A long song title or a long device name must truncate with an ellipsis, never push buttons off screen (Library cards, Setup header, connection pill) — check the CSS for `min-width: 0` + `text-overflow` on flex children (Tasks 3, 4, 5).
2. Opening the options sheet during Play must not steal keyboard/MIDI input or pause the song, and closing it with Escape or the backdrop must return focus (Tasks 2, 7).
3. The auto-dim must never hide controls while paused, finished, or with the sheet open — pinned by the idle-dimmer tests and the `setEnabled` wiring (Tasks 2, 7).
4. Canvas restyle must keep per-frame allocations flat — pinned by the gradient-cache test (Task 6).
5. Phone portrait Play: the single capsule must still offer back, play/pause, seek and the options sheet — check markup at `< 600px` (Task 7).

Ruling recorded for this plan: UI tasks specify tokens, structure, behaviour and acceptance criteria rather than every CSS line — the user asked for Opus to do the visual design work; pure logic (helpers, canvas palette, cache) is given as full code with tests.

---

### Task 1: Design foundation

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/main.ts`, `vite.config.ts`, `index.html`, `src/app.css`, `README.md`
- Modify: `src/ui/components/Segmented.svelte`, `src/ui/components/ConnectionBadge.svelte`, `src/ui/components/SoundOutputField.svelte`
- Create: `src/ui/components/AppHeader.svelte`

**Interfaces:**
- Produces:
  - Global CSS tokens (spec §2.1) and base classes usable by every later task: `button` (default glass), `button.primary`, `button.ghost`, `button.danger`, `button.icon` (44×44 square), `.card`, `.screen` (scrolling menu screen with safe-area padding and the `--bg-glow` background), `.glass` (capsule: `--glass` + blur + `--border` + `--shadow-pop`), `.label` (11.5 px uppercase), `.dim`, `.error`, `.pill` (small rounded chip), `input[type=checkbox].switch` (switch look, `role="switch"` set in markup), styled `input[type=range]`, `select`, `input[type=text]`.
  - `Segmented.svelte` props: `options`, `value`, `onchange`, `label`, plus new optional `full?: boolean` (stretch to full width, equal parts).
  - `ConnectionBadge.svelte` props unchanged: `compact?: boolean`.
  - `AppHeader.svelte` props: `title?: string` (omit → brand mark + "Piano Professor"), `onback?: () => void` (shows a back icon button when set), `showSettings?: boolean` (default true; settings button opens Settings like today's gear: `screen.update((current) => ({ name: 'settings', back: current }))`), children slot for extra right-side content.

- [ ] **Step 1: Add the dependencies**

```bash
pnpm add -E @lucide/svelte@1.48.0 @fontsource-variable/plus-jakarta-sans@5.3.0
npm install --package-lock-only
git status --short   # package.json and package-lock.json changed; pnpm-lock.yaml stays untracked
```

- [ ] **Step 2: Load the font and precache it**

In `src/main.ts`, add as the first import: `import '@fontsource-variable/plus-jakarta-sans';`
In `vite.config.ts`, change Workbox `globPatterns` to `['**/*.{js,wasm,css,html,mp3,woff2}']`, the manifest `orientation` to `'any'`, and `background_color` / `theme_color` to `'#0a0c16'`.
In `index.html`, set `<meta name="theme-color" content="#0a0c16" />`.

- [ ] **Step 3: Rewrite `src/app.css`**

Replace the variables with the spec §2.1 tokens (keep these old names as aliases so screens not yet restyled keep working until their task: `--surface-2`, `--border`, `--text`, `--text-dim`, `--accent` → `var(--cyan)`, `--accent-text` → `#06121a`, `--right`, `--left`, `--danger`, `--ok` → `var(--success)`, `--radius`, `--tap`). Then write the base element styles of spec §2.2 and §2.3: font family `var(--font)`, body background `var(--bg)`, `#app { height: 100dvh }`, buttons and their variants, focus ring, switch, range, select, text input, `.card`, `.screen`, `.screen-header` (kept for not-yet-migrated screens), `.glass`, `.label`, `.pill`, `.dim`, `.error`, reduced-motion rule, `@media (hover: hover)` hover states.

- [ ] **Step 4: Restyle the shared components**

- `Segmented.svelte`: pill container (`--surface`, `--border`, padding 3 px, radius `--radius-sm` + 3 px), options `white-space: nowrap`, selected `--accent-soft` with white text and weight 700; `full` prop makes it `display: flex; width: 100%` with `flex: 1` options. Keep `role="radiogroup"`/`role="radio"`/`aria-checked`.
- `ConnectionBadge.svelte`: glass pill, 8 px status dot (connected `--success` with a 3 px soft halo, connecting `--warning`, disconnected `--danger`), name truncated with ellipsis (`max-width: 220px`, `min-width: 0`); `compact` shows only the dot in a 44×44 round button. Still opens Settings on click.
- `SoundOutputField.svelte`: label (`.label`) above a `Segmented full`.

- [ ] **Step 5: Create `AppHeader.svelte`**

Layout: a flex row, `gap: 12px`, height ≥ 56 px, padding with safe-area insets. Left: back icon button (`ArrowLeft`, `aria-label={$t('common.back')}`) when `onback` is set; then either the brand (a 32×32 rounded square with `--accent-gradient` holding the `Piano` icon, and "Piano Professor" in 18 px / 800) or the `title` (20–24 px / 800, single line, ellipsis, `min-width: 0; flex: 1`). Right: children, `ConnectionBadge` (`compact` below 600 px via a media query that swaps which badge shows — or a `compact` derived from a `matchMedia('(max-width: 599px)')` store), and the settings icon button (`Settings` icon) when `showSettings`.

- [ ] **Step 6: README**

Update the manual checklist line "Installed PWA opens full screen in landscape…" to "Installed PWA opens full screen in any orientation and works in airplane mode." Add to Credits: "Icons: [Lucide](https://lucide.dev) (ISC). Font: Plus Jakarta Sans (SIL Open Font License), through Fontsource."

- [ ] **Step 7: Verify and commit**

Run `npm test`, `npm run check`, `npm run build` — all clean. The existing screens must still render (they use the aliased variables and kept classes).

```bash
git add package.json package-lock.json src/main.ts vite.config.ts index.html src/app.css README.md src/ui/components/Segmented.svelte src/ui/components/ConnectionBadge.svelte src/ui/components/SoundOutputField.svelte src/ui/components/AppHeader.svelte
git commit -m "feat(ui): neon design system, font, icons and shared header"
```

---

### Task 2: Options sheet and idle dimmer

**Files:**
- Create: `src/ui/idle-dimmer.ts`, `tests/ui/idle-dimmer.test.ts`, `src/ui/components/Sheet.svelte`
- Modify: `src/i18n/en.ts`, `src/i18n/es.ts` (add `common.close`: "Close" / "Cerrar", `common.more`: "More options" / "Más opciones")

**Interfaces:**
- Produces:
  - `createIdleDimmer(options: { delayMs: number; onChange: (dimmed: boolean) => void }): IdleDimmer` with `interface IdleDimmer { poke(): void; setEnabled(enabled: boolean): void; dispose(): void }`.
  - `Sheet.svelte` props: `open: boolean`, `title: string`, `onclose: () => void`, `children: Snippet`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/idle-dimmer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleDimmer } from '../../src/ui/idle-dimmer';

describe('idle dimmer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const changes: boolean[] = [];
    const dimmer = createIdleDimmer({ delayMs: 3000, onChange: (d) => changes.push(d) });
    return { changes, dimmer };
  }

  it('does nothing while disabled', () => {
    const { changes } = setup();
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([]);
  });

  it('dims after the delay once enabled, and only once', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(2999);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([true]);
  });

  it('a poke undims and restarts the wait', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(3000);
    dimmer.poke();
    expect(changes).toEqual([true, false]);
    vi.advanceTimersByTime(2999);
    expect(changes).toEqual([true, false]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false, true]);
  });

  it('a poke before dimming only restarts the wait', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(2000);
    dimmer.poke();
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
  });

  it('disabling undims and stops the wait', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(3000);
    dimmer.setEnabled(false);
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([true, false]);
  });

  it('re-enabling while enabled does not restart a running wait', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(2000);
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
  });

  it('dispose undims and cancels the timer', () => {
    const { changes, dimmer } = setup();
    dimmer.setEnabled(true);
    vi.advanceTimersByTime(3000);
    dimmer.dispose();
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ui/idle-dimmer.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Write the helper**

Create `src/ui/idle-dimmer.ts`:

```ts
export interface IdleDimmer {
  /** Something happened: undim and restart the wait. */
  poke(): void;
  /** Dimming only happens while enabled (e.g. while the song plays and no panel is open). */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/** Calls onChange(true) after `delayMs` without a poke while enabled, and onChange(false) when that ends. */
export function createIdleDimmer(options: { delayMs: number; onChange: (dimmed: boolean) => void }): IdleDimmer {
  let enabled = false;
  let dimmed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const set = (next: boolean) => {
    if (next === dimmed) return;
    dimmed = next;
    options.onChange(next);
  };
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const restart = () => {
    stop();
    timer = setTimeout(() => {
      timer = null;
      set(true);
    }, options.delayMs);
  };

  return {
    poke() {
      set(false);
      if (enabled) restart();
    },
    setEnabled(next) {
      if (next === enabled) return;
      enabled = next;
      if (enabled) restart();
      else {
        stop();
        set(false);
      }
    },
    dispose() {
      enabled = false;
      stop();
      set(false);
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ui/idle-dimmer.test.ts` — Expected: PASS (7 tests).

- [ ] **Step 5: Write `Sheet.svelte`**

Behaviour (spec §3): renders nothing when `open` is false. When open: a full-screen backdrop (`rgba(4,6,14,.55)`, click → `onclose`) and a panel with `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title. Header row: title (16 px / 700) and a close icon button (`X`, `aria-label={$t('common.close')}`). Body scrolls (`overflow-y: auto`). `< 720px`: bottom sheet (left/right/bottom 0, radius top `--radius-lg`, grab handle 36×4 px, `max-height: 75dvh`, `padding-bottom: max(16px, env(safe-area-inset-bottom))`, slide-up 200 ms). `≥ 720px`: floating panel `position: fixed; top: max(64px, env(safe-area-inset-top) + 56px); right: max(12px, env(safe-area-inset-right)); width: 360px; max-height: calc(100dvh - 88px)`, fade/scale-in 150 ms. Background `--surface-solid`, border `--border-strong`, shadow `--shadow-pop`. Escape key closes (listener on `window` while open, `stopPropagation` not needed). On open, focus moves to the panel (`tabindex="-1"`); on close, focus returns to the element that was focused before opening. Do not stop pointer/keyboard events from reaching the rest of the app (the piano keyboard input listens on `window` for PC keys; Escape is the only key the sheet handles).

- [ ] **Step 6: Verify and commit**

`npm test`, `npm run check`, `npm run build`.

```bash
git add src/ui/idle-dimmer.ts tests/ui/idle-dimmer.test.ts src/ui/components/Sheet.svelte src/i18n/en.ts src/i18n/es.ts
git commit -m "feat(ui): options sheet and idle dimmer"
```

---

### Task 3: Library

**Files:**
- Create: `src/ui/latest-practice.ts`, `tests/ui/latest-practice.test.ts`
- Modify: `src/ui/screens/Library.svelte`, `src/i18n/en.ts`, `src/i18n/es.ts`

**Interfaces:**
- Consumes: `AppHeader`, base classes (Task 1); `ScoreRecord` from `src/storage/db.ts` (`{ key, songId, hand, mode, best: RunResult, history: RunResult[] }`, history most recent first; `RunResult` has `date: number` and `percent: number`).
- Produces: `latestPractice(records: readonly ScoreRecord[]): ScoreRecord | null`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/latest-practice.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '../../src/storage/db';
import { latestPractice } from '../../src/ui/latest-practice';

const SCORE = { kind: 'wait', totalSteps: 10, completedSteps: 10, cleanSteps: 8, wrongNotes: 2, elapsedMs: 1000 } as const;
const NO_RUN = { date: 0, speed: 1, percent: 0, score: SCORE };

function record(songId: string, hand: 'right' | 'left' | 'both', dates: number[]): ScoreRecord {
  const runs = dates.map((date) => ({ date, speed: 1, percent: 80, score: SCORE }));
  return { key: `${songId}|${hand}|wait`, songId, hand, mode: 'wait', best: runs[0] ?? NO_RUN, history: runs };
}

describe('latestPractice', () => {
  it('is null without records or runs', () => {
    expect(latestPractice([])).toBeNull();
    expect(latestPractice([record('a', 'right', [])])).toBeNull();
  });

  it('picks the record whose most recent run is the latest', () => {
    const records = [record('a', 'right', [300, 100]), record('b', 'left', [500]), record('a', 'both', [400])];
    expect(latestPractice(records)?.key).toBe('b|left|wait');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ui/latest-practice.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Write the helper**

Create `src/ui/latest-practice.ts`:

```ts
import type { ScoreRecord } from '../storage/db';

/** The score record with the most recent run, for "keep practising"; null if nothing was ever played. */
export function latestPractice(records: readonly ScoreRecord[]): ScoreRecord | null {
  let latest: ScoreRecord | null = null;
  for (const record of records) {
    const date = record.history[0]?.date;
    if (date === undefined) continue;
    if (!latest || date > latest.history[0].date) latest = record;
  }
  return latest;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ui/latest-practice.test.ts` — Expected: PASS.

- [ ] **Step 5: Rebuild `Library.svelte`** (spec §4.1)

Keep all current logic (refresh, import, demo, rename, delete, errors, file input). New structure:
- `AppHeader` (brand).
- Featured card (`.card` variant with `background: linear-gradient(120deg, rgba(124,92,255,.28), rgba(34,211,238,.16))`, border `--border-strong`, radius `--radius-lg`):
  - With `latest = latestPractice(all records)` and its song still in the library: label "Keep practising" / "Seguir practicando" (`library.continueTitle`), song title (20 px / 800, ellipsis), "hand · mode · best %" (reuse `HAND_KEYS`, `MODE_KEYS`), buttons *Free play* (secondary, `Piano` icon) and **Continue** (`library.continue`, primary, `Play` icon) which does `screen.set({ name: 'play', request: { songId, hand: latest.hand, mode: latest.mode, speed: $settings.lastSpeed } })`.
  - Otherwise: welcome text (`library.welcome`: "Add a MIDI song to start practising." / "Añade una canción MIDI para empezar a practicar.") with **Add song** (primary, `Plus`) and *Demo song* (`library.demo`).
- Toolbar row: "Library" title (`library.title`, 28/24 px) with a dim count (`library.count`: "{n} songs" / "{n} canciones"), then *Free play* and **Add song** buttons (icons + text; on phones the two buttons share the row full-width).
- Errors: dismissible banner (border `--danger`, `X` icon button) above the grid.
- Song grid `repeat(auto-fill, minmax(260px, 1fr))`, gap 12 px; each card: title (15 px / 700, 2-line clamp), duration (dim, tabular), up to 3 best results as rows "hand · mode" + thin bar (6 px, track `--surface-2`, fill `--accent-gradient`, width = percent) + percent; a round 44 px play button (`Play` icon, `aria-label` = the song title + `setup.start` text or a new `library.open` key) that opens setup; a `more` icon button (`Ellipsis`, `aria-label={$t('common.more')}`) that toggles a small inline menu (*Rename* `Pencil`, *Delete* `Trash2`). Rename and delete confirmation stay inline inside the card (input + Save/Cancel; "Delete …?" + Delete/Cancel). The whole card body is also clickable to open setup (keyboard accessible via the play button; don't nest buttons).
- Empty library (no songs, loaded): the featured card shows the welcome variant and the grid is hidden.

- [ ] **Step 6: Verify and commit**

`npm test`, `npm run check`, `npm run build`.

```bash
git add src/ui/latest-practice.ts tests/ui/latest-practice.test.ts src/ui/screens/Library.svelte src/i18n/en.ts src/i18n/es.ts
git commit -m "feat(ui): redesigned library with keep-practising card"
```

---

### Task 4: Song setup

**Files:**
- Modify: `src/ui/screens/SongSetup.svelte`, `src/i18n/en.ts`, `src/i18n/es.ts`

**Interfaces:**
- Consumes: `AppHeader`, `Segmented` (`full`), `SoundOutputField`, base classes, `.switch` checkbox style (Task 1).

- [ ] **Step 1: Rebuild the markup and styles** (spec §4.2)

Keep all script logic unchanged. New structure:
- `AppHeader` with `onback` → library and `title` = song title.
- Container: `≥ 1024px` two columns (`grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`, Tracks left, Practice right); below, one column with **Practice first** (use CSS `order` or markup order with the wide layout reordering via grid areas).
- Practice card (title `setup.practice`: "Practice" / "Práctica", with `Hand` icon): Hand `Segmented full`; Mode `Segmented full` + dim hint; Speed: `.label` row with the value in a `.pill` (tabular) and the range below; Sound subsection (`.label` "Sound" — reuse an existing key if one exists, else add `setup.soundSection`): `SoundOutputField`, "Play the other parts" as a `.switch` checkbox with `role="switch"`, volume range with value pill; the "no notes for this hand" error.
- Actions: *Listen to the song* (secondary, `Headphones` icon) and **Start** (primary, `Play` icon). On `≥ 600px` they sit at the bottom of the Practice card, right-aligned. On `< 600px` they are a fixed bottom bar (`.glass`, full width, two equal buttons, `padding-bottom: max(12px, env(safe-area-inset-bottom))`), and the screen gets matching bottom padding so content is not hidden.
- Tracks card (title `setup.tracks`, `Music` icon): "Split hands by pitch" as a `.switch`; split slider with the note in a pill; track rows as a grid `minmax(0,1fr) auto auto` (name + dim info with ellipsis | role `select` | 44 px preview icon button with `Play`/`Square` icon, `aria-label` from `setup.preview`). On `< 400px` the select drops under the name (grid wraps).

- [ ] **Step 2: Verify and commit**

`npm test`, `npm run check`, `npm run build`.

```bash
git add src/ui/screens/SongSetup.svelte src/i18n/en.ts src/i18n/es.ts
git commit -m "feat(ui): redesigned song setup for phones and tablets"
```

---

### Task 5: Settings

**Files:**
- Modify: `src/ui/screens/Settings.svelte`, `src/i18n/en.ts`, `src/i18n/es.ts` (only if a new key is needed)

- [ ] **Step 1: Rebuild the markup and styles** (spec §4.3)

Keep all script logic. `AppHeader` with `onback={() => screen.set(back)}`, `title={$t('settings.title')}`, `showSettings={false}`. Sections in a grid `repeat(auto-fit, minmax(300px, 1fr))` (one column on phones), each a `.card` with an icon + title row:
- **Piano connection** (`Piano` icon): `ConnectionBadge`, error text, USB device `select`, *Look for USB piano again* (`Usb` icon), *Connect via Bluetooth* (`Bluetooth` icon), the dim Bluetooth note — keep every current control and condition.
- **Display** (`Settings`/`Gauge` icon): Language `select`, Note names `Segmented full`, Keyboard `Segmented full`, "Show names on falling notes" and "Show accompaniment notes" as `.switch` rows (label left, switch right).
- **Sound** (`Volume2` icon): `SoundOutputField`, "Play the other parts" switch row, volume range with a value pill.
Labels use `.label` style above controls; rows separated by 14–16 px.

- [ ] **Step 2: Verify and commit**

`npm test`, `npm run check`, `npm run build`.

```bash
git add src/ui/screens/Settings.svelte src/i18n/en.ts src/i18n/es.ts
git commit -m "feat(ui): redesigned settings"
```

---

### Task 6: Neon canvas

**Files:**
- Modify: `src/render/colors.ts`, `src/render/renderer.ts`, `tests/render/render.test.ts`

**Interfaces:**
- Consumes: spec §4.6 palette.
- Produces: same exported functions and inputs as today (`drawFrame`, `drawFreePlayFrame`, `geometry`, `visibleRange`, `trailRect`, `freePlaySide`, `maxNoteDuration`); new `COLORS` keys below.

- [ ] **Step 1: Replace the palette**

`src/render/colors.ts`:

```ts
/** The play area is always dark ("Neón moderno"). */
export const COLORS = {
  background: '#090b16',
  blackLane: '#070913',
  measureLine: 'rgba(255, 255, 255, 0.06)',
  loopShade: 'rgba(124, 92, 255, 0.08)',
  hitLineFrom: '#7c5cff',
  hitLineTo: '#22d3ee',
  hitGlow: 'rgba(34, 211, 238, 0.25)',
  right: '#22d3ee',
  rightDark: '#0e9fbd',
  rightGlow: 'rgba(34, 211, 238, 0.28)',
  left: '#a78bfa',
  leftDark: '#7c5cff',
  leftGlow: 'rgba(167, 139, 250, 0.30)',
  accompaniment: '#64748b',
  wrong: '#fb7185',
  neutral: '#e2e8f0',
  expected: 'rgba(251, 191, 36, 0.55)',
  noteShine: 'rgba(255, 255, 255, 0.35)',
  whiteKey: '#eef1fb',
  whiteKeyShade: '#cfd5ea',
  whiteKeyEdge: '#9aa3c0',
  blackKey: '#1a1d2e',
  blackKeyTop: '#2b2f45',
  label: 'rgba(8, 10, 22, 0.8)',
  scrollTrack: 'rgba(255, 255, 255, 0.08)',
  scrollThumb: 'rgba(34, 211, 238, 0.6)',
} as const;
```

- [ ] **Step 2: Update the test context and write the failing tests**

In `tests/render/render.test.ts`, make `recordingContext()` return a fake gradient for `createLinearGradient` (an array has no `addColorStop`):

```ts
      if (prop === 'createLinearGradient') {
        return (...args: unknown[]) => {
          calls.push(`createLinearGradient`);
          const stops: string[] = [];
          return { args, stops, addColorStop: (_: number, c: string) => stops.push(c), toString: () => `gradient(${stops.join(',')})` };
        };
      }
```

(Put this branch at the top of the proxy `get`, before the generic recorder.) Then:
- Update colour expectations to the new palette: right `#22d3ee`, left `#a78bfa`, accompaniment `#64748b`, wrong `#fb7185`, neutral `#e2e8f0`, position-bar thumb `rgba(34, 211, 238, 0.6)`. Note fills now include the halo (`fill:rgba(34, 211, 238, 0.28)`) before the note fill and the shine (`fillRect:rgba(255, 255, 255, 0.35)`) after — update the `fill:` sequences accordingly (faded notes have no halo or shine).
- White keys are drawn with the cached gradient: count them as `fillRect:gradient(#eef1fb,#cfd5ea)` (the scrolled-view test expects 26).
- Add a test that gradients are cached per geometry:

```ts
  it('creates the keyboard and hit-line gradients once per geometry, not per frame', () => {
    const { ctx, calls } = recordingContext();
    const input = { ...listening, notes: [pn(60, 1, 1, 'right')], songTime: 0, showAccompaniment: true, pressed: new Map(), showPlayedKeys: false };
    drawFrame(ctx, input);
    const first = calls.filter((c) => c === 'createLinearGradient').length;
    drawFrame(ctx, input);
    drawFrame(ctx, input);
    expect(first).toBeGreaterThan(0);
    expect(calls.filter((c) => c === 'createLinearGradient').length).toBe(first);
    drawFrame(ctx, { ...input, height: 700 });
    expect(calls.filter((c) => c === 'createLinearGradient').length).toBeGreaterThan(first);
  });
```

Run `npx vitest run tests/render/render.test.ts` — Expected: FAIL (old colours, no gradients, no cache).

- [ ] **Step 3: Update the drawing**

In `src/render/renderer.ts`:
- Note colours: `noteColor` uses `right`/`rightDark`/`left`/`leftDark`/`accompaniment` as today with the new values. Add `noteGlow(role)` → `rightGlow`/`leftGlow`.
- For each drawn note that is **not faded**: first fill a rounded rect 3 px larger on every side with the glow colour (`ctx.globalAlpha = 1`), then the note as today, then a 2 px shine strip at the top (`fillRect(x + 2, top + 1, width - 4, 2)` in `noteShine`, only if the note is ≥ 8 px tall). Faded notes: unchanged (alpha, no glow, no shine). Same for free-play bars (glow uses the side's glow colour; alpha from velocity applies to the bar only).
- Labels draw in `COLORS.label` (dark text on bright notes).
- Gradient cache: a module-level `let cache: { ctx: CanvasRenderingContext2D; width: number; top: number; height: number; white: CanvasGradient; black: CanvasGradient; hit: CanvasGradient } | null = null;` and `function gradients(ctx, width, g)` that rebuilds only when `ctx`, `width`, `g.keyboardTop` or `g.keyboardHeight` differ: `white` = vertical `keyboardTop → keyboardTop + keyboardHeight`, stops `whiteKey` → `whiteKeyShade`; `black` = vertical `keyboardTop → keyboardTop + keyboardHeight * 0.62`, stops `blackKeyTop` → `blackKey`; `hit` = horizontal `0 → width`, stops `hitLineFrom` → `hitLineTo`.
- `drawHitLine`: glow strip `fillRect(0, keyboardTop - 6, width, 6)` in `hitGlow`, then the 2 px line with the `hit` gradient.
- `drawKeyboard`: unlit white keys use the `white` gradient, unlit black keys the `black` gradient; lit/pressed keys keep solid colours as today; white key edge in `whiteKeyEdge`.
- Position bar uses `scrollTrack` / `scrollThumb`.
- Everything else (geometry, culling, scrolling, measure lines, loop shade, played/pressed logic) unchanged.

- [ ] **Step 4: Verify and commit**

`npx vitest run tests/render` green, then `npm test`, `npm run check`, `npm run build`.

```bash
git add src/render/colors.ts src/render/renderer.ts tests/render/render.test.ts
git commit -m "feat(render): neon falling notes, glowing hit line and shaded keys"
```

---

### Task 7: Immersive Play screen

**Files:**
- Modify: `src/ui/screens/Play.svelte`, `src/ui/components/ViewControls.svelte`, `src/ui/components/ResultsOverlay.svelte`, `src/ui/components/ListenEndOverlay.svelte`, `src/i18n/en.ts`, `src/i18n/es.ts`
- Create: `src/ui/components/PlayOptions.svelte`

**Interfaces:**
- Consumes: `Sheet` and `createIdleDimmer` (Task 2), base classes and `.glass` (Task 1), `PlayController` public API (unchanged: `pause`, `resume`, `seek`, `setSpeed`, `restart`, `setLoop`, `zoomKeys`, `zoomTime`, `fit`, `follow`, …) and `ViewState` (`src/ui/view-state.ts`).
- Produces:
  - `ViewControls.svelte` becomes an **inline section** (no absolute positioning, no Follow button): props `view: ViewState`, `onzoomkeys`, `onzoomtime`, `onfit` (drop `onfollow`). Rows: "↔ Keys" label + `Minus`/`Plus` icon buttons, "↕ Time" label + buttons, *Fit* (`Maximize2` icon). Labels: add `view.keys` ("Keys" / "Teclas"), `view.time` ("Time" / "Tiempo"), `play.view` ("View" / "Vista").
  - `PlayOptions.svelte`: the sheet body with sections Hand (Segmented with the four `HANDS` incl. Listen), Speed (− value +, same steps/limits as today), A–B loop (toggle + from/to steppers + pass score, same logic as today), View (`ViewControls`). Props carry the values and callbacks from Play.svelte (keep all state and logic in Play.svelte; PlayOptions is presentational).

- [ ] **Step 1: Rebuild `Play.svelte`** (spec §4.4)

Keep every bit of current script logic (controller lifecycle, wake lock, finish/results, loop, speed, hand, seek, retry, settings effect, view state). New markup:
- `.play` is `position: relative; height: 100dvh; overflow: hidden; background: #090b16`; the canvas fills it (`position: absolute; inset: 0`).
- A controls layer (`position: absolute; inset: 0; pointer-events: none` — children `pointer-events: auto`) with safe-area padding:
  - Top-left `.glass` capsule: back (`ArrowLeft`), play/pause (`Play`/`Pause`, primary gradient round button, `aria-label` resume/pause).
  - Top-centre `.glass` capsule (flex 1, max 640 px): progress bar (12 px tall hit area ≥ 32 px, track `--surface-2`, fill `--accent-gradient`, loop zone tint, click/tap seeks as today) and time `m:ss / m:ss` (tabular).
  - Top-right `.glass` capsule: speed pill (`Gauge` icon + %), hand pill (short hand label), compact connection badge, more button (`Ellipsis`, `aria-label={$t('play.options')}` — add `play.options`: "Options" / "Opciones"). Tapping the speed or hand pill or more opens the sheet.
  - `< 600px` wide: the three capsules collapse into one full-width `.glass` capsule: back, play/pause, progress (flex 1, time hidden or shown small), more. Speed/hand pills hidden there (they live in the sheet).
  - When `view.showFollow`: a `.glass` pill button below the top row, centred, `Crosshair` icon + `view.follow` text, calls `controller.follow()`.
- `Sheet` (`title={$t('play.options')}`) with `PlayOptions`.
- Idle dimming: `createIdleDimmer({ delayMs: 3000, onChange })` → toggles a `dimmed` class on the controls layer (`opacity: .35`, transition 400 ms; reduced-motion: no transition). `setEnabled(status === 'playing' && !sheetOpen && !results && !listenEnded)` in an `$effect`. `poke()` on `pointerdown` and `pointermove` (window, capture, passive) and `keydown`. Dispose on destroy.
- Overlays stay above everything (z-order: canvas < controls < follow < overlays < sheet).

- [ ] **Step 2: Restyle the overlays**

`ResultsOverlay.svelte` and `ListenEndOverlay.svelte`: backdrop `rgba(4,6,14,.6)` with blur 6 px; centred `.card` with `--surface-solid`, radius `--radius-lg`, max-width 440 px, padding 24 px. Results: big percent (56 px / 800, text filled with `--accent-gradient` via `background-clip: text`), "new best" pill, stats in a 3-column grid of small cards (label + tabular value), buttons *Retry* (`RotateCcw`) and **Library** / existing actions as today. Listen end: title + *Listen again* (`Headphones`) + **Practise it** (`Play`, primary). Keep all props and texts.

- [ ] **Step 3: Verify and commit**

`npm test`, `npm run check`, `npm run build`.

```bash
git add src/ui/screens/Play.svelte src/ui/components/PlayOptions.svelte src/ui/components/ViewControls.svelte src/ui/components/ResultsOverlay.svelte src/ui/components/ListenEndOverlay.svelte src/i18n/en.ts src/i18n/es.ts
git commit -m "feat(ui): immersive play screen with floating glass controls"
```

---

### Task 8: Immersive Free play

**Files:**
- Modify: `src/ui/screens/FreePlay.svelte`, `src/i18n/en.ts`, `src/i18n/es.ts` (only if needed)

**Interfaces:**
- Consumes: `Sheet`, `createIdleDimmer`, `.glass`, inline `ViewControls` (Tasks 2, 1, 7), `FreePlayController` API (unchanged).

- [ ] **Step 1: Rebuild `FreePlay.svelte`** (spec §4.5)

Keep all script logic. Full-screen canvas as in Play. Controls layer:
- Top-left `.glass`: back (`ArrowLeft`) + title "Free play" (16 px / 700; hidden `< 400px`).
- Top-centre: a `.glass` pill with the held note names (tabular, ellipsis), only when notes are held.
- Top-right `.glass`: compact connection badge, settings icon button (opens Settings as today), more (`Ellipsis`) → `Sheet` titled `play.view` containing `ViewControls`.
- Hint text centred in the canvas area (`--text-dim`, 15 px), hidden after the first note as today.
- Idle dimming: enabled while notes have been played recently? Use: `setEnabled(!sheetOpen)`, `poke()` on pointer/key activity — controls dim 3 s after the last touch, so playing on the piano leaves a clean view.

- [ ] **Step 2: Verify and commit**

`npm test`, `npm run check`, `npm run build`.

```bash
git add src/ui/screens/FreePlay.svelte src/i18n/en.ts src/i18n/es.ts
git commit -m "feat(ui): immersive free play"
```

---

### Task 9: Visual check (coordinating session)

Done by the coordinating session with Chrome, not a subagent: load the dev server inside iframes of 360×640, 390×844, 844×390, 800×1280 and 1280×800 and check every screen (library empty and with songs, setup, settings, play with the options sheet open, follow pill, results overlay, listen-end overlay, free play) for: no horizontal scroll, nothing clipped, touch targets, ellipsis on long titles (rename the demo song to a 60-character title), focus ring with Tab, dimming after 3 s while playing, and no console errors. Findings go into the final review's fix wave.
