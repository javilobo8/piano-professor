# Piano Professor — Diseño (v1)

Fecha: 2026-10-13
Estado: aprobado

## 1. Objetivo

Web estilo **Synthesia** para practicar piano con un **Roland FP-10** conectado a una
**tablet Android**. Cargas un MIDI, las notas caen hacia un teclado en pantalla y vas
tocándolas en el piano real. En modo espera la canción solo avanza si pulsas las teclas
correctas; puedes practicar cada mano por separado o ambas.

Uso personal: sin servidor, sin cuentas, sin biblioteca online.

### Criterios de éxito

- Con el FP-10 conectado por USB o Bluetooth, la tablet detecta las teclas pulsadas y la
  canción avanza en modo espera sin retraso perceptible.
- Practicando una mano, el piano toca la otra mano y el acompañamiento por sus altavoces.
- La app se instala como PWA, abre a pantalla completa en horizontal y funciona sin
  internet tras la primera carga.
- Las canciones añadidas siguen ahí al volver a abrir la app.

## 2. Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Dispositivo | Tablet Android con Chrome. iPad fuera de alcance (Safari no tiene Web MIDI). |
| Piano | Roland FP-10: USB "to Host" (MIDI class-compliant) y Bluetooth MIDI integrado. |
| Conexión | USB por Web MIDI API (principal) + Bluetooth por Web Bluetooth con BLE-MIDI propio (alternativa). |
| Sonido | Las notas que no toca el usuario se envían por MIDI al FP-10. No hay audio en la tablet. |
| Funciones v1 | Modo espera, modo con tempo, elegir mano, velocidad, bucle A–B, biblioteca guardada con puntuaciones. |
| Stack | Vite + TypeScript + Svelte 5, render en Canvas 2D. |
| Idiomas | Inglés (por defecto) y español. |
| Alojamiento | GitHub Pages (HTTPS) + PWA instalable y offline. |

## 3. Arquitectura

Todo corre en el navegador. Siete módulos con una responsabilidad cada uno:

```
midi-io ──(noteOn/noteOff con timestamp)──▶ engine ──(estado por frame)──▶ render
   ▲                                          │
   └──────────(notas a enviar al piano)───────┘
storage ──(bytes MIDI + config)──▶ song ──(notas con mano asignada)──▶ engine
ui (Svelte) orquesta pantallas y conecta los módulos.
```

- **`midi-io`** — conexión con el piano. Interfaz común `MidiConnection`; implementaciones
  `WebMidiConnection` (USB) y `BleMidiConnection` (Bluetooth). El resto de la app no sabe
  por dónde está conectado.
- **`song`** — `.mid` → `Song` (notas en segundos, pistas, compases) y asignación de manos.
- **`engine`** — `PracticeSession`: lógica pura, sin APIs del navegador. Recibe tiempo y
  notas pulsadas; decide avance/espera, aciertos/fallos, puntuación y notas a enviar.
- **`render`** — dibuja en un `<canvas>` las notas que caen y el teclado a partir del estado
  del motor. Funciones de dibujo puras (`draw(ctx, viewModel)`).
- **`ui`** — pantallas Svelte: biblioteca, preparar canción, tocar, resultados, ajustes.
- **`storage`** — IndexedDB (canciones, puntuaciones) y localStorage (ajustes).
- **`i18n`** — diccionarios `en` / `es` y función `t(key)`.

### Estructura de carpetas

```
src/
  midi-io/   types.ts  web-midi.ts  ble-midi.ts  ble-packet.ts  connection-manager.ts
  song/      types.ts  parse.ts  hands.ts  steps.ts
  engine/    types.ts  session.ts  wait-judge.ts  tempo-judge.ts  auto-player.ts  scoring.ts
  util/      bisect.ts
  render/    renderer.ts  keyboard-layout.ts  colors.ts
  storage/   db.ts  songs.ts  scores.ts  settings.ts
  i18n/      index.ts  en.ts  es.ts
  ui/        App.svelte  screens/*.svelte  components/*.svelte
  main.ts
tests/       *.test.ts  fixtures/ (MIDIs pequeños generados en los tests)
```

### Temporización

- Los eventos de Web MIDI traen `timeStamp` en la misma base que `performance.now()`. Para
  BLE se usa `performance.now()` en el momento de recepción (latencia BLE ~10–20 ms,
  aceptable).
- El motor calcula el **tiempo de canción** de cada evento a partir de su timestamp, no del
  frame en que se procesa. Un frame lento no convierte un acierto en fallo.
- Tiempo de canción avanza a `Δreal × velocidad` salvo en pausa o esperando (modo espera).

## 4. Canciones y manos (`song`)

### Modelo

```ts
interface SongNote {
  id: number;
  pitch: number;      // 21–108
  start: number;      // segundos de canción
  end: number;
  velocity: number;   // 0–1
  track: number;
}
interface TrackInfo { index: number; name: string; channel: number; noteCount: number; avgPitch: number; }
interface Song { title: string; duration: number; notes: SongNote[]; tracks: TrackInfo[]; measures: number[]; }
//   notes ordenadas por start; measures = fronteras de compás (s): measures[0] = 0,
//   el compás i va de measures[i] a measures[i+1], y el último valor ≥ duration

type Role = 'right' | 'left' | 'accompaniment' | 'ignore';
interface HandConfig {
  method: 'tracks' | 'split';
  trackRoles: Record<number, Role>;     // method 'tracks'
  splitPitch: number;                   // method 'split', defecto 60 (Do central)
}
interface PlayableNote extends SongNote { role: 'right' | 'left' | 'accompaniment'; }
```

### Lectura

- `@tonejs/midi` → notas en segundos (respeta el mapa de tempos) y compases (`timeSignatures`).
  Si el MIDI no trae compás, se asume 4/4.
- `@tonejs/midi` ya separa cada pista del archivo en una pista por (canal, instrumento), así
  que una pista única con dos canales llega como dos pistas: no hace falta un método por canal.
- Se descartan las notas del canal 10 (percusión), las notas fuera del rango del piano
  (21–108) y las pistas sin notas.
- Título: el nombre del archivo sin extensión (renombrable en la biblioteca).

### Asignación automática de manos (`hands.ts`)

1. **≥ 2 pistas con notas → `tracks`.** Por nombre de pista (sin distinguir mayúsculas):
   `right|rh|derecha|treble|mano d` → derecha; `left|lh|izquierda|bass|mano i` → izquierda.
   Si el nombre no resuelve las dos manos: de las dos pistas con más notas, la de
   `avgPitch` mayor es derecha y la otra izquierda. El resto de pistas → acompañamiento.
2. **1 pista → `split`.** `pitch >= splitPitch` → derecha, si no izquierda.

En modo `split` todas las notas de todas las pistas se reparten por altura; los roles de
pista no se usan. La pantalla de preparar permite cambiar entre `tracks` y `split`.

El usuario puede cambiar todo en "Preparar canción"; su elección se guarda con la canción.

### Pasos (`steps.ts`)

Notas requeridas que empiezan con menos de **30 ms** de diferencia forman un **paso**
(acorde). El modo espera trabaja por pasos.

## 5. Motor de práctica (`engine`)

### API

```ts
type Mode = 'wait' | 'tempo';
type Practice = 'right' | 'left' | 'both' | 'none';   // 'none' = escuchar la canción

interface SessionConfig {
  mode: Mode;
  practice: Practice;
  speed: number;                        // 0.25–1.5
  loop: { startMeasure: number; endMeasure: number } | null;
  soundOn: boolean;
  volume: number;                       // 0–1, escala la velocity de salida
}

class PracticeSession {
  constructor(notes: PlayableNote[], measures: number[], config: SessionConfig, nowMs: number);
  tick(nowMs: number): void;
  noteOn(pitch: number, velocity: number, timeMs: number): void;
  noteOff(pitch: number, timeMs: number): void;
  pause(nowMs: number): void;
  resume(nowMs: number): void;
  seek(songTime: number, nowMs: number): void;
  setSpeed(speed: number, nowMs: number): void;
  setLoop(loop: SessionConfig['loop'], nowMs: number): void;
  getState(): SessionState;             // lo que necesita render y la UI
  drainOutput(): OutputEvent[];         // noteOn/noteOff/allNotesOff para el piano
}
```

`SessionState` incluye: `songTime`, `status` (`playing | waiting | paused | finished`),
teclas pulsadas con su resultado (`correct-right | correct-left | wrong`), teclas esperadas
(para el brillo en modo espera), puntuación en curso y número de vuelta del bucle.

### Notas requeridas y automáticas

- **Requeridas:** las de la mano practicada (`both` = derecha + izquierda; `none` = ninguna).
- **Automáticas:** el resto de manos y el acompañamiento. Si `soundOn`, se envía `noteOn`
  cuando el tiempo de canción cruza su `start` y `noteOff` al cruzar su `end`. Si el tiempo
  se para (espera/pausa), las notas automáticas también.

### Modo espera

- El tiempo avanza hasta el `start` del siguiente paso con notas pendientes y se detiene.
- Cada `noteOn` cuyo pitch está pendiente en el paso actual lo marca como hecho. Cuando
  todas están hechas, el tiempo continúa.
- **Pulsación anticipada:** un `noteOn` que llega ≤ 100 ms (tiempo real) antes de que el
  tiempo alcance el paso cuenta para ese paso.
- **Nota equivocada** (no pendiente en el paso actual ni anticipable): tecla en rojo,
  `wrongNotes++`, el paso se marca como "sucio". No avanza ni deshace lo ya acertado.
- Una nota repetida exige un `noteOn` nuevo; mantenerla pulsada no cuenta.
- **Puntuación:** `cleanSteps / totalSteps` (%), `wrongNotes`, tiempo total.

### Modo con tempo

- El tiempo avanza siempre.
- Ventana de acierto **±150 ms** de tiempo real (= ±0,150 × velocidad en tiempo de
  canción) alrededor del `start` de cada nota requerida.
  Un `noteOn` del pitch correcto dentro de la ventana empareja con la nota no emparejada
  más cercana → acierto; **perfecto** si |Δ| ≤ 50 ms.
- Nota requerida cuya ventana pasa sin emparejar → fallo.
- `noteOn` que no empareja con nada → nota de más (tecla en rojo).
- **Puntuación:** `precisión = aciertos / (aciertos + fallos + notas de más)`, aciertos,
  perfectos, fallos, notas de más, mejor racha.

### Común

- **Entrada inicial:** el tiempo arranca 2 s (reales) antes de la primera nota de la
  canción (de cualquier mano), para oír la introducción.
- **Velocidad:** 25 %–150 % en pasos de 5 %. Cambiarla en marcha no salta el tiempo.
- **Bucle A–B:** compases indexados desde 0, ambos inclusive. Al llegar al final del
  compás B (`measures[B+1]`, o fin de canción si B es el último), salto al inicio del
  compás A menos la duración de 1 compás de entrada. Cada vuelta se puntúa aparte y se muestra en el HUD. Las vueltas del
  bucle **no** cuentan para la mejor marca; solo las partidas de canción completa.
- **Pausa, salto, fin y salida:** se emite `allNotesOff` para que no queden notas colgadas.
- **Fin de canción:** `status = 'finished'` y resultados.

## 6. Conexión con el piano (`midi-io`)

```ts
interface MidiConnection {
  readonly kind: 'usb' | 'ble';
  readonly name: string;
  onNote(cb: (e: { type: 'on' | 'off'; pitch: number; velocity: number; timeMs: number }) => void): () => void;
  onDisconnect(cb: () => void): () => void;
  send(event: OutputEvent): void;
  close(): void;
}
```

- `noteOn` con velocity 0 se trata como `noteOff`. Se ignoran CC, pedal, SysEx.

### USB (Web MIDI)

- `navigator.requestMIDIAccess({ sysex: false })` al arrancar.
- Selección automática: entrada/salida cuyo nombre contiene `FP-10` o `Roland`; si no,
  la primera disponible. Elegible manualmente en Ajustes.
- `statechange` para conectar/desconectar en caliente.

### Bluetooth (Web Bluetooth + BLE-MIDI)

- Servicio `03b80e5a-ede8-4b33-a751-6ce34ec4c700`, característica
  `7772e5db-3868-4112-a1a9-f2669d106bf3` (notify + write without response).
- Botón "Connect via Bluetooth" → `requestDevice({ filters: [{ services: [BLE_MIDI] }] })`.
- `ble-packet.ts` (puro, con tests):
  - **Decodificar:** byte de cabecera (bit7=1), luego secuencias `[timestamp (bit7=1)]
    [status (bit7=1)] [datos]`, con running status (datos sin status, con o sin timestamp
    previo). SysEx se ignora.
  - **Codificar:** `[0x80 | tsHigh6, 0x80 | tsLow7, status, data1, data2]`.
- Reconexión automática ante `gattserverdisconnected`: hasta 3 intentos con espera
  creciente (1 s, 2 s, 4 s). Si fallan, el indicador pasa a rojo y se muestra el botón.
- Limitación conocida: Chrome Android no permite reconectar sin gesto del usuario al
  abrir la app; por Bluetooth hay que pulsar "Conectar" una vez por sesión.

### Salida al piano

- Solo `noteOn`/`noteOff` en canal 1. Velocity de salida = velocity de la nota × `volume`.
- No se envían los mensajes de pedal del MIDI.
- `allNotesOff` = CC123 + `noteOff` de las notas activas que la app envió.

### Entrada sin piano (pruebas)

- Tocar las teclas del teclado en pantalla (pointer events) y, en escritorio, teclado del
  PC (fila `A S D F …` = teclas blancas, `W E T Y U …` = negras, `Z`/`X` cambian de octava).
  Ambos generan los mismos eventos que `MidiConnection`.

### Errores

| Situación | Mensaje |
|-----------|---------|
| Sin `navigator.requestMIDIAccess` | "Open this app in Chrome" |
| Permiso MIDI denegado | Cómo reactivarlo en la configuración del sitio |
| Sin `navigator.bluetooth` / Bluetooth apagado | Aviso con la solución |
| Archivo no es MIDI válido | "This file could not be read as MIDI" |
| MIDI sin notas jugables | "This song has no notes to play" |

## 7. Interfaz (`ui` + `render`)

Horizontal, pantalla completa (PWA), Wake Lock activo en la pantalla de tocar.

### Pantallas

1. **Library** — lista de canciones (título, duración, mejores marcas), "Add song",
   renombrar/borrar, indicador de conexión, acceso a ajustes.
2. **Song setup** — rol de cada pista (con botón de escuchar la pista) o deslizador de
   punto de corte; mano (R / L / Both), modo (Wait / Tempo), velocidad, sonido y volumen,
   "Listen" (el piano toca la canción entera), "Start".
3. **Play** — barra superior (volver, pausa, progreso con compases y zona A–B marcada,
   tiempo, velocidad, cambio rápido de mano, conexión); cascada de notas; teclado.
   El bucle A–B se activa con un botón y sus compases se ajustan con botones −/+ (más
   cómodos en pantalla táctil que arrastrar marcadores).
4. **Results** — superpuesta: marca de la partida, mejor marca, "Retry" / "Back".
5. **Settings** — idioma, nombres de notas, conexión (USB/BLE, elegir dispositivo),
   volumen, mostrar acompañamiento, rango de teclado, nombres sobre las notas.

### Dibujo (Canvas 2D)

- Canvas a resolución real (`devicePixelRatio`), bucle con `requestAnimationFrame`.
- **Teclado:** por defecto el rango de la canción ampliado a teclas blancas en los
  extremos, mínimo 2 octavas; opción de 88 teclas. `keyboard-layout.ts` calcula x/ancho de
  cada tecla (puro, con tests).
- **Cascada:** rectángulos redondeados, altura = duración; ~3 s de canción visibles.
  Colores: **verde** derecha, **azul** izquierda, variante oscura en teclas negras;
  notas no requeridas con opacidad baja; acompañamiento gris tenue (u oculto). Líneas de
  compás horizontales. Nombre de nota dentro opcional.
- **Teclas pulsadas:** verde/azul si son correctas, rojo si no. En espera, las teclas
  pendientes brillan.

### Idiomas

- Diccionarios `en.ts` y `es.ts` con las mismas claves (comprobado por test). Idioma por
  defecto `en`; guardado en ajustes.
- Nombres de notas: `auto` (C-D-E en inglés, Do-Re-Mi en español), `letters` o `solfege`.

## 8. Almacenamiento (`storage`)

- **IndexedDB** (`idb`), base `piano-professor` v1:
  - `songs` — clave `id` (UUID): `{ id, title, fileName, bytes: ArrayBuffer, addedAt,
    duration, handConfig }`.
  - `scores` — clave `[songId, practice, mode]`: `{ best: Result, history: Result[] (≤10) }`,
    `Result = { date, speed, ...métricas del modo }`. "Mejor" = mayor % principal
    (pasos limpios en espera, precisión en tempo).
- **localStorage** — ajustes (`language`, `noteNames`, `volume`, `soundOn`,
  `showAccompaniment`, `keyboardRange`, `showNoteLabels`, `preferredDevice`). Lecturas y
  escrituras en `try/catch` con valores por defecto.
- `navigator.storage.persist()` al añadir la primera canción.
- Borrar una canción borra también sus puntuaciones.

## 9. PWA y publicación

- `vite-plugin-pwa`: manifiesto (`display: fullscreen`, `orientation: landscape`, iconos),
  service worker con precache de todos los assets, actualización automática.
- GitHub Pages con GitHub Actions al hacer push a `main`. `base` de Vite configurado para
  la ruta del repositorio. La creación del repositorio remoto se confirma con el usuario.

## 10. Pruebas

- **Vitest** (sin navegador) para:
  - `song`: parseo, compases, las tres estrategias de asignación de manos, pasos.
    Fixtures MIDI generados en el propio test con `@tonejs/midi`.
  - `engine`: espera (avance, anticipación, nota equivocada, repetidas, acordes), tempo
    (ventanas, perfecto, fallos, notas de más, racha), velocidad, bucle, notas automáticas,
    `allNotesOff`. Con tiempos simulados.
  - `ble-packet`: decodificar (simple, varios mensajes, running status, con y sin
    timestamp intermedio) y codificar.
  - `keyboard-layout`, `i18n` (mismas claves en ambos idiomas).
- **Prueba manual** en la tablet con el FP-10 (checklist en el README): USB, Bluetooth,
  reconexión, sonido por el piano, latencia percibida, PWA instalada y offline.

## 11. Fuera de alcance (v1)

Partitura, digitación, grabación, biblioteca online, cuentas, iPad, sonido por la tablet,
exportar/importar biblioteca.

## 12. Riesgos

- **BLE-MIDI con el FP-10 en Chrome Android**: se valida pronto en el plan con una prueba
  mínima de conexión antes de construir encima.
- **Rendimiento del canvas en la tablet**: se dibuja solo lo visible (búsqueda binaria por
  tiempo en las notas ordenadas).
