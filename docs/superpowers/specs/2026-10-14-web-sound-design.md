# Sonido en el navegador — Diseño

Fecha: 2026-10-14
Estado: aprobado (aprobación automática, preferencia del proyecto)

## 1. Objetivo

Hoy la app solo suena a través del FP-10 por MIDI ("No hay audio en la tablet", spec v1).
Se añade un **piano de cola sampleado en el navegador** (Web Audio) y un ajuste
**Salida de sonido: Piano / Navegador / Ambos**.

### Criterios de éxito

- Sin piano conectado y con salida "Navegador": el teclado táctil y el del PC, las otras
  partes de la canción y "Escuchar" suenan por los altavoces de la tablet o del PC.
- Con el FP-10 conectado y salida "Navegador" o "Ambos": lo que tocas en el FP-10 (notas y
  pedal de sustain) también suena en el navegador.
- Con salida "Piano" todo funciona como ahora y no se descargan ni decodifican muestras.
- Funciona sin internet tras la primera carga (las muestras entran en el precache del PWA).
- Cambiar la salida en mitad de una canción no deja notas colgadas en ningún destino.

## 2. Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Ajuste | `soundOutput: 'piano' \| 'web' \| 'both'`, por defecto `'piano'` (comportamiento actual). |
| Qué suena en el navegador | Si la salida incluye navegador: todo lo que genera la app (otras manos y acompañamiento, Escuchar canción o pista, teclado táctil y del PC) **y** lo que se toca en el FP-10 (notas y pedal de sustain). |
| Qué va al piano | Si la salida incluye piano: lo que genera la app, como ahora. Las teclas del FP-10 siempre suenan en el FP-10 (control local del piano, la app no lo toca). En "Ambos" tus teclas suenan por los dos lados; para oír solo el navegador se baja el volumen del FP-10 (el MIDI sigue funcionando). |
| Sonido | Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0), versión mp3 que publica Tone.js (`https://tonejs.github.io/audio/salamander/`): 30 muestras (A, C, D♯ y F♯ desde A0 hasta C8). Cada nota usa la muestra más cercana (a ≤ 1 semitono) cambiando `playbackRate`. |
| Preparación de las muestras | Script versionado `scripts/fetch-piano-samples.sh` (curl + ffmpeg): descarga, pasa a mono, recorta a 8 s con fundido final de 1,5 s y codifica mp3 a 64 kbps. Los mp3 resultantes se versionan en `public/samples/piano/` junto a su licencia. Motivo: memoria. Las originales son estéreo y de ~16 s; decodificadas ocupan ~150 MB, en mono y 8 s ~45 MB. |
| Carga | Perezosa: solo cuando la salida incluye navegador (al arrancar o al cambiar el ajuste). Mientras carga, las notas para el navegador se ignoran; las del piano no esperan. |
| Offline | Workbox precachea también `**/*.mp3`. |
| Teclado táctil en Tocar | Pasa a sonar por la salida elegida, igual que en Tocar libre (antes era mudo en Tocar). Sin esto, en "Navegador" sonaría el acompañamiento pero no tus notas. |
| Desbloqueo del audio | Chrome exige un gesto del usuario: el `AudioContext` se reanuda en cada `pointerdown` / `keydown` (en captura, en toda la app) y al volver la app a primer plano. |
| Latencia | `new AudioContext({ latencyHint: 'interactive' })`, notas al instante (`currentTime`). Por Bluetooth, el eco del FP-10 en el navegador lleva además el retraso BLE; aceptado. |
| Dónde se elige | Ajustes › Sonido, Preparar canción (junto a "Tocar las otras partes") y un engranaje nuevo en Tocar libre que abre Ajustes. Tocar no cambia (abrir Ajustes desde Tocar reinicia la canción, problema conocido). |

## 3. Arquitectura

Nuevo módulo `src/audio/`. Los controladores dejan de llamar a `connection.send` y envían
todo a un `SoundSink`; `SoundOutput` decide a dónde va.

```
controladores ──OutputEvent──▶ SoundOutput.send ──(piano)──▶ ConnectionManager.send ──▶ FP-10
                                     │
                                     └──────(navegador)──▶ WebPiano, fuente 'app'

ConnectionManager.onNote / onPedal (teclas del FP-10) ──(navegador)──▶ WebPiano, fuente 'player'
```

### 3.1 `midi-io`: pedal de sustain

- `types.ts`: `PedalEvent { type: 'pedal'; down: boolean; timeMs: number }` y
  `MidiInputEvent = NoteEvent | PedalEvent`. En `MidiConnection`, `onNote` pasa a
  `onInput(cb: (e: MidiInputEvent) => void)`.
- `messages.ts`: `decodeMidiMessage` devuelve `MidiInputEvent | null`. CC64 en cualquier
  canal (`0xBn 64 v`) es pedal, `down = v >= 64`. El resto de controladores sigue en `null`.
- `web-midi.ts`, `ble-midi.ts`: el mismo flujo con el nuevo nombre y tipo.
- `ConnectionManager`: `onNote` sigue entregando solo notas (sus consumidores no cambian) y
  se añade `onPedal(cb: (e: PedalEvent) => void)`. Se elimina `emitVirtual` (ver 3.6): desde
  ahora `onNote` solo trae notas del piano.

### 3.2 `audio/samples.ts` (puro)

- `SAMPLE_PITCHES`: 21, 24, 27, …, 108 (30 valores). `sampleName(pitch)` → `'A0'`, `'C1'`,
  `'Ds1'`, `'Fs1'`, … (los nombres de archivo de Tone.js).
- `nearestSample(pitch)` → `{ samplePitch, playbackRate }`, con
  `playbackRate = 2 ** ((pitch − samplePitch) / 12)`; el pitch se limita a 21–108.
- `velocityGain(v)` (v en 0–1) → ganancia `0.05 + 0.95 · v²`.
- `velocityCutoff(v)` → frecuencia del paso bajo, exponencial de 1500 Hz (v = 0) a
  16000 Hz (v = 1): las notas suaves suenan más apagadas, como en un piano real (las
  muestras tienen una sola capa de intensidad).

### 3.3 `audio/voices.ts` (puro) — `VoiceBook<V>`

Contabilidad de voces sin Web Audio, genérica sobre el manejador de voz `V`.
Fuentes: `'app' | 'player'`. Polifonía máxima `MAX_VOICES = 48`.

- `start(source, pitch, voice)` → voces a cortar: la de la misma fuente y pitch si sigue
  sonando (repetición) y la más antigua si se supera la polifonía.
- `release(source, pitch)` → la voz a soltar, o ninguna si es `'player'` con el pedal
  pisado (queda sostenida).
- `setPedal(down)` (solo `'player'`) → al levantar, devuelve las voces sostenidas cuya
  tecla ya no está pulsada.
- `releaseAll(source?)` → todas las voces de esa fuente (o de ambas). Con `'player'` (o sin
  fuente) también olvida el pedal y las teclas pulsadas.
- `ended(voice)` → quita una voz que terminó sola.
- Regla: el `allNotesOff` de la app (`'app'`) nunca corta voces `'player'`, igual que el
  "All Notes Off" MIDI del FP-10 no corta lo que se toca en sus teclas.

### 3.4 `audio/web-piano.ts` — `WebPiano`

Capa fina de Web Audio sobre `VoiceBook`.

- `status`: compatible con stores de Svelte (`subscribe`), `'idle' | 'loading' | 'ready' | 'error'`.
- `load()`: idempotente mientras carga o está lista; crea el `AudioContext`, descarga y
  decodifica las 30 muestras en paralelo
  (`fetch(new URL('samples/piano/<nombre>.mp3', document.baseURI))`). Si algo falla →
  `'error'`; una nueva llamada a `load()` reintenta.
- `resume()`: `ctx.resume()` si está suspendido; sin contexto no hace nada.
- `noteOn(source, pitch, velocity)` (velocity 0–1), `noteOff(source, pitch)`,
  `setPedal(down)`, `allNotesOff(source?)`.
- Cadena por voz: `AudioBufferSourceNode` (`playbackRate`) → `BiquadFilterNode` paso bajo
  (`velocityCutoff`) → `GainNode` (`velocityGain`) → ganancia maestra (0.8) →
  `DynamicsCompressorNode` → `destination`.
- Soltar: `gain.setTargetAtTime(0, t, 0.1)` y `stop(t + 1)`. Cortar (repetición o robo de
  voz): constante 0.015 s y `stop(t + 0.1)`. `onended` → `VoiceBook.ended`.
- Antes de `'ready'`, `noteOn` se ignora; el resto es seguro.
- Dependencias inyectables (`createContext`, `fetchSample`) para las pruebas.

### 3.5 `audio/sound-output.ts` — `SoundOutput`

- Exporta `SoundSink { send(event: OutputEvent): void }` y `SoundTarget = 'piano' | 'web' | 'both'`.
- `constructor(connection, piano)`, `setTarget(target)`, `send(event)`.
- `send`: si el destino incluye piano → `connection.send(event)`. Si incluye navegador →
  `noteOn` → `piano.noteOn('app', pitch, velocity / 127)`, `noteOff` →
  `piano.noteOff('app', pitch)`, `allNotesOff` → `piano.allNotesOff('app')`.
- Escucha `connection.onNote` y `connection.onPedal`: si el destino incluye navegador, los
  reproduce como fuente `'player'`. Escucha el estado de la conexión: si deja de estar
  conectada → `piano.allNotesOff('player')`.
- `setTarget`: si deja de incluir navegador → `piano.allNotesOff()`; si deja de incluir
  piano → `connection.send({ type: 'allNotesOff' })`; si pasa a incluir navegador →
  `piano.load()`. Llamar con el mismo destino no hace nada (los ajustes notifican cualquier
  cambio, como el volumen).
- `app-state.ts`: `export const webPiano = new WebPiano()`,
  `export const output = new SoundOutput(connection, webPiano)` y una suscripción a
  `settings` que llama a `output.setTarget(s.soundOutput)`.

### 3.6 Controladores

- `PlayController`, `FreePlayController` y `Previewer` reciben un `SoundSink` para todo lo
  que antes mandaban con `connection.send`. Siguen usando `connection` para la entrada
  (`onNote`, `subscribe`). `Previewer` ya no necesita `connection`.
- `PlayController`, teclado táctil y del PC: ya no usa `emitVirtual`. Alimenta la sesión
  directamente (`noteOn` / `noteOff` y `flush`) y envía `noteOn` / `noteOff` a la salida.
  Cuenta las fuentes que sostienen cada pitch como hace Tocar libre, y una nota del piano en
  un pitch sostenido en pantalla se ignora como eco (igual que en Tocar libre).
- Ese contador por pitch se extrae a un helper compartido por los dos controladores:
  `ui/local-notes.ts` (`press(pitch)` → `true` si es la primera fuente, `release(pitch)` →
  `true` si era la última, `has(pitch)`).

### 3.7 UI e i18n

- `storage/settings.ts`: `soundOutput` con su validador y valor por defecto.
- Selector segmentado "Salida de sonido" / "Sound output": Piano / Navegador / Ambos
  (Piano / Browser / Both), en Ajustes › Sonido y en el bloque de sonido de Preparar canción.
  Debajo, si la salida incluye navegador: `'loading'` → "Cargando el sonido del navegador…",
  `'error'` → "No se pudo cargar el sonido del navegador." con un botón "Reintentar" que
  llama a `webPiano.load()`. En Ajustes, con salida "Navegador": "Las teclas del piano siguen sonando en el
  piano: baja su volumen para oír solo el navegador."
- `setup.sound`: "Tocar las otras partes en el piano" → "Tocar las otras partes"
  ("Play the other parts on the piano" → "Play the other parts").
- Tocar libre: engranaje en la cabecera que abre Ajustes con `back` a Tocar libre.
- `App.svelte`: escuchas globales en captura de `pointerdown` y `keydown` →
  `webPiano.resume()`; `visibilitychange` a visible → `webPiano.resume()`.

### 3.8 PWA, recursos y documentación

- `public/samples/piano/*.mp3` (30) y `public/samples/piano/LICENSE.txt` (CC BY 3.0, autoría).
- `vite.config.ts`: `workbox: { globPatterns: ['**/*.{js,css,html,svg,png,mp3}'] }`.
- README: sección de salida de sonido, créditos de las muestras y puntos nuevos en la lista
  de pruebas con el hardware (eco de teclas y pedal en el navegador).

## 4. Errores y casos límite

- Las muestras no cargan (red, decodificación) o no hay Web Audio (`AudioContext` no existe)
  → estado `'error'` con mensaje; la salida por piano no se ve afectada.
- El piano se desconecta → se sueltan las voces `'player'` y el pedal.
- La salida cambia a mitad → `allNotesOff` en el destino que se deja.
- `pagehide` → los controladores ya mandan `allNotesOff`, que ahora llega a los dos destinos.
- Más de 48 voces → se corta la más antigua.
- Una voz sostenida cuyo pedal nunca se levanta termina sola al acabarse la muestra (8 s).
- Teclado táctil en Tocar: el `allNotesOff` que manda la canción (paso completado en modo
  espera, saltos, bucle) también corta una nota táctil que siga pulsada, en el piano y en el
  navegador. La nota que completa un paso se envía después de ese `allNotesOff`, así que
  siempre suena. Aceptado: las teclas del FP-10 no se ven afectadas.

## 5. Pruebas

- Unitarias (vitest, entorno node): pedal en `decodeMidiMessage`; `ConnectionManager.onPedal`
  y que `onNote` ya no reciba notas virtuales; `samples.ts`; `VoiceBook` (repetición,
  sustain, `releaseAll` por fuente, robo de voz); `SoundOutput` con dobles (reparto por
  destino, limpieza al cambiar, eco de teclas solo con navegador, liberación al desconectar,
  carga al activar navegador); `WebPiano` con un `AudioContext` falso (ignora notas antes de
  estar lista, transiciones de estado, error); validador de ajustes; `local-notes`.
- Manuales en navegador: cambiar la salida en Ajustes; Tocar libre con teclado táctil en
  "Navegador"; acompañamiento y "Escuchar" en "Navegador"; cambiar de salida a mitad de una
  canción sin notas colgadas.
- Con hardware (lista del README): teclas y pedal del FP-10 suenan en el navegador.

## 6. Fuera de alcance

- Apagar el control local del FP-10 desde la app.
- Volumen propio del navegador (se usa el del dispositivo).
- Varias capas de intensidad, resonancia de cuerdas o pedal de sustain en canciones MIDI.
- Otros instrumentos.
