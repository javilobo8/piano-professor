# Zoom horizontal y vertical — Diseño

Fecha: 2026-10-14
Estado: aprobado (aprobación automática, preferencia del proyecto)

## 1. Objetivo

Hoy la vista de notas es fija: el teclado ocupa todo el ancho (rango de la canción o las 88
teclas) y encima se ven siempre 3 segundos de música (`VISIBLE_SECONDS`). Se añade:

- **Zoom vertical**: cuántos segundos caben encima del teclado. Alejar = más notas a la
  vista; acercar = notas más separadas.
- **Zoom horizontal**: teclas más anchas y menos teclas a la vista. Con zoom, la vista se
  desplaza por el teclado.

En **Tocar** y en **Tocar libre**. Se maneja con gestos (pellizcar y arrastrar), botones
flotantes y, en el PC, la rueda del ratón.

### Criterios de éxito

- En Tocar, pellizcar en horizontal sobre las notas ensancha o estrecha las teclas;
  pellizcar en vertical cambia los segundos visibles. Lo mismo con los botones y la rueda.
- Con zoom horizontal en Tocar, las próximas notas de la mano que practicas están siempre en
  pantalla sin tocar nada (seguimiento). Con un dedo se arrastra la vista a otro sitio, y
  "Seguir" devuelve el seguimiento automático.
- Las teclas táctiles suenan en el tono correcto con cualquier zoom y desplazamiento.
- Cada pantalla recuerda su zoom entre sesiones. Tocar libre recuerda también dónde estaba.
- "Ajustar" vuelve a todo el rango del teclado y a 3 s.
- El zoom no añade objetos nuevos por frame al bucle de dibujo. El teclado solo se
  recalcula al cambiar el zoom, el rango o el tamaño.

## 2. Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Pantallas | Tocar y Tocar libre. |
| Unidad horizontal | **Teclas blancas a la vista** (fraccionario). El rango sigue siendo el de hoy: el de la canción o el completo (ajuste `keyboardRange`), y en Tocar libre las 88 teclas. Mínimo `MIN_WHITE_KEYS = 8`; máximo, todas las del rango ("ajustado"). |
| Unidad vertical | **Segundos a la vista**, de `MIN_SECONDS = 1.5` a `MAX_SECONDS = 8`, por defecto `DEFAULT_SECONDS = 3`. |
| Qué parte se ve (Tocar) | **Seguimiento**: la vista se mueve sola y con suavidad para que las próximas notas de las manos practicadas estén dentro (detalles en 3.3). Arrastrar con un dedo lo pausa; el botón "Seguir" lo reanuda. También se reanuda al buscar en la barra de progreso, al reiniciar, al cambiar de mano y al cambiar el bucle A–B. |
| Qué parte se ve (Tocar libre) | Manual: arrastrar. Sin seguimiento (no hay canción que seguir). |
| Gestos (táctil y ratón) | Solo sobre la zona de notas (encima del teclado); el teclado sigue siendo para tocar. 1 dedo o ratón arrastrando: desplaza en horizontal. 2 dedos: pellizco con el eje fijado al empezar por el ángulo entre los dedos (más horizontal → zoom horizontal anclado en el punto medio; más vertical → zoom vertical). El pellizco solo hace zoom; desplazar es cosa de 1 dedo, así un pellizco nunca pausa el seguimiento. |
| Rueda (PC) | Ctrl+rueda (y el pellizco del trackpad, que llega así): zoom horizontal anclado en el cursor. Mayús+rueda o rueda horizontal: desplazar. Rueda sola: zoom vertical. Hacia arriba acerca. |
| Botones | Panel flotante arriba a la derecha de la zona de notas: `↔ − +`, `↕ − +`, `Ajustar`, y en Tocar `Seguir` (solo con zoom horizontal y el seguimiento pausado). Cada pulsación multiplica o divide por 1,25. En los límites el botón se desactiva. |
| Dónde estoy | Con zoom horizontal se dibuja una barra fina (4 px) arriba del todo: la pista es el rango completo, el tramo claro la parte visible. |
| Memoria | Por pantalla, en Ajustes (localStorage): `playView` y `freePlayView`. Se guardan al terminar un gesto, al pulsar un botón y 300 ms después de la última rueda, no en cada movimiento. |
| Altura del teclado | Sigue la regla de hoy (ancho de tecla blanca × 5, entre el 14 % y el 26 % de la altura): con zoom horizontal el teclado crece hasta el 26 %. |

### Qué guarda el zoom horizontal

`whiteKeys: number | null` es "como mucho estas teclas blancas a la vista"; `null` = todo
el rango. Así las teclas miden lo mismo en todas las canciones: con `whiteKeys = 20`, una
canción de 15 teclas blancas se ve entera y una de 30 se ve con zoom.

Solo se guarda un valor nuevo cuando lo que se ve cambia. Alejar en una canción que ya se
ve entera no toca el valor guardado. Alejar hasta llegar a todo el rango guarda `null`.

## 3. Arquitectura

```
ViewGestures (pointer/wheel en el canvas) ──▶ controlador ──▶ Viewport (zoom, desplazamiento, layout)
ViewControls.svelte (botones) ─────────────▶ controlador        │
                                               │                ▼
                                   followTarget (Tocar)    drawFrame / drawFreePlayFrame (scrollX, seconds)
                                               │
                                      onViewChange / onViewCommit ──▶ pantalla Svelte ──▶ settings
```

### 3.1 Ajustes (`storage/settings.ts`)

```ts
export interface ViewZoom {
  /** Most white keys on screen; null = the whole keyboard range. */
  whiteKeys: number | null;
  /** Song seconds visible above the keyboard. */
  seconds: number;
}
export interface FreePlayView extends ViewZoom {
  /** Pitch at the centre of the view (fractional), so free play reopens where it was. */
  center: number;
}
playView: ViewZoom;          // por defecto { whiteKeys: null, seconds: 3 }
freePlayView: FreePlayView;  // por defecto { whiteKeys: null, seconds: 3, center: 60 }
```

Validación: `whiteKeys` es `null` o un número finito entre 8 y 52; `seconds` está entre 1,5 y
8; `center` está entre 21 y 108. Un objeto inválido vuelve al valor por defecto completo.

### 3.2 `render/viewport.ts` (puro) — `Viewport`

Guarda el rango (`low`, `high`, `whiteCount`), el ancho CSS de la vista, las teclas blancas
visibles efectivas, el desplazamiento y los segundos. Expone:

- `layout: KeyboardLayout`: el teclado sobre el **ancho del contenido**
  (`viewWidth × whiteCount / visibleWhites`); `key.x` va en coordenadas de contenido. Solo se
  recalcula en `resize`, al cambiar el zoom horizontal o el rango.
- `scrollX` (px de contenido en el borde izquierdo), `seconds`, `visibleWhites`, `zoomed`
  (`visibleWhites < whiteCount`).
- `resize(viewWidth)`: mantiene las teclas visibles y el centro.
- `setRange(low, high)`: mantiene el zoom guardado y el centro (lo más cerca posible).
- `zoomKeys(factor, anchorX)`: `visibleWhites × factor` limitado a `[min(8, whiteCount),
  whiteCount]`; el punto del contenido bajo `anchorX` (px de la vista) sigue bajo `anchorX`.
- `zoomTime(factor)`: `seconds × factor` limitado a `[1.5, 8]`.
- `panBy(dx)` y `scrollTo(x)`: limitan `scrollX` a `[0, contentWidth − viewWidth]`.
- `centerOn(pitch)` / `centerPitch()`: para restaurar y guardar Tocar libre.
- `fit()`: todo el rango y 3 s.
- `zoom(): ViewZoom` con la regla de 2 ("solo se guarda si lo visible cambió"): el
  `Viewport` recuerda el `whiteKeys` guardado y solo lo sustituye cuando `zoomKeys` cambia
  `visibleWhites` de verdad.
- `canZoomKeys(direction)`, `canZoomTime(direction)` para los botones.

### 3.3 `render/follow.ts` (puro) — `followTarget`

`followTarget(notes, from, to, roles, layout, songTime, scrollX, viewWidth): number | null`
devuelve el `scrollX` objetivo, o `null` si no hay que moverse.

1. Candidatas: notas de `[from, to)` (el `visibleRange` del frame) cuyo papel está en
   `roles`, que no han terminado (`end > songTime`), en orden de inicio. Las que ya suenan
   van primero.
2. Se abre un tramo `[izq, der]` con la primera candidata y se amplía con las siguientes
   mientras `der − izq + 2·margen ≤ viewWidth` (margen = 1 tecla blanca). Se para en la
   primera que no cabe.
3. Si el tramo ya está dentro de `[scrollX + margen, scrollX + viewWidth − margen]`, no se
   mueve (`null`). Si se sale, se mueve lo mínimo para meterlo. Si el tramo solo (un acorde)
   no cabe, se centra. El resultado se limita al contenido.

`roles` son las manos practicadas. Al escuchar (`practice: 'none'`) son derecha e izquierda.
El acompañamiento nunca se sigue.

El controlador suaviza: `scrollX += (objetivo − scrollX) · (1 − e^(−dt/150 ms))`. En el
primer frame salta directo al objetivo.

### 3.4 Renderer (`render/renderer.ts`)

- `VISIBLE_SECONDS` desaparece. `DEFAULT_SECONDS`, `MIN_SECONDS` y `MAX_SECONDS` viven en
  `viewport.ts`.
- `geometry(width, height, whiteWidth, seconds = DEFAULT_SECONDS)`: `pxPerSecond =
  keyboardTop / seconds`.
- `visibleRange(notes, songTime, maxDuration, seconds)`.
- `FrameInput` y `FreePlayFrameInput` reciben `scrollX` y `seconds`. El fondo, la línea de
  golpeo, las líneas de compás y la sombra del bucle ocupan el ancho de la vista. Las calles
  negras, las notas y el teclado se dibujan con `ctx.translate(−scrollX, 0)`, y se saltan las
  teclas y notas fuera de la vista.
- Con zoom horizontal se dibuja la barra de posición: 4 px arriba, pista
  `rgba(255,255,255,0.08)`, tramo visible `rgba(255,255,255,0.35)` (colores nuevos en
  `COLORS`).
- `trailRect(note, nowMs, g)` no cambia (usa `g.pxPerSecond`).

### 3.5 `render/note-trail.ts`

`visible(nowMs, seconds)`: descarta las notas soltadas que ya salieron por arriba con los
segundos actuales. Deja de importar desde `renderer.ts`.

### 3.6 Entrada

- `ui/keyboard-input.ts`: `KeyboardSurface` añade `scrollX`. El toque busca
  `keyAt(layout, x + scrollX, …)`.
- Nuevo `ui/view-gestures.ts` — `ViewGestures`: escucha `pointerdown/move/up/cancel` y
  `wheel` (`passive: false`) en el canvas. Solo acepta punteros que empiezan encima de
  `keyboardTop` (la misma `KeyboardSurface`), así que nunca choca con `KeyboardInput`. Llama
  a un `ViewGestureHandler`:

  ```ts
  interface ViewGestureHandler {
    zoomKeys(factor: number, anchorX: number): void;
    zoomTime(factor: number): void;
    /** Manual pan: pauses following in Play. */
    pan(dx: number): void;
    /** A gesture ended (or the wheel went quiet for 300 ms): save the zoom. */
    commit(): void;
  }
  ```

  - 1 puntero: arrastrar desplaza tras un umbral de 6 px; el movimiento vertical se ignora.
  - 2 punteros: eje fijado por el ángulo inicial. El factor es incremental: distancia anterior
    sobre el eje / distancia actual, con un mínimo de 24 px para no disparar el factor. No
    desplaza: así un pellizco no pausa el seguimiento.
  - Un 3.er puntero se ignora. Al levantar un dedo de un pellizco, el que queda sigue como
    arrastre desde su posición actual.
  - Rueda: `deltaMode` de líneas × 16 px. Factor `e^(deltaY · 0.0025)` (una muesca de 100 px
    da ×1,28).

### 3.7 Controladores

`PlayController` y `FreePlayController`:

- Crean un `Viewport` con el zoom guardado (y en Tocar libre `centerOn(center)`) y un
  `ViewGestures` que les llama. Implementan el handler: `pan` mueve el `Viewport` y en Tocar
  pone `following = false`.
- Métodos para los botones: `zoomKeys(direction: 1 | -1)` (anclado al centro de la vista),
  `zoomTime(direction)`, `fit()`, y en Tocar `follow()`.
- Callbacks nuevos en el constructor: `onViewChange(state: ViewState)`, solo cuando cambia
  algo que muestran los botones, y `onViewCommit(zoom)` para guardar.

  ```ts
  interface ViewState {
    canZoomKeysIn: boolean; canZoomKeysOut: boolean;
    canZoomTimeIn: boolean; canZoomTimeOut: boolean;
    /** Play only: show the Follow button. */
    showFollow: boolean;
  }
  ```

- Tocar: cada frame, si `following` y `zoomed`, calcula `followTarget` y suaviza `scrollX`.
  `seek`, `restart` y `setLoop` ponen `following = true`. `setDisplay` con otro
  `keyboardRange` llama a `viewport.setRange`.
- El `resize()` de ambos usa `viewport.resize` en vez de `layoutKeyboard` directo.

### 3.8 Svelte

- Nuevo `ui/components/ViewControls.svelte`: el panel flotante, translúcido (opacidad 0,7;
  1 al pulsar), botones de 44 px. Recibe `ViewState` y callbacks.
- `Play.svelte` y `FreePlay.svelte`: lo ponen en `.stage`, pasan `$settings.playView` /
  `freePlayView` al controlador y escriben en `settings` en `onViewCommit`. Los overlays de
  resultados y de "escuchar otra vez" quedan por encima.
- i18n (es/en): `view.moreKeys` (Más teclas / More keys), `view.widerKeys` (Teclas más
  anchas / Wider keys), `view.moreTime` (Más notas a la vista / More notes ahead),
  `view.lessTime` (Notas más separadas / Notes further apart), `view.fit` (Ajustar / Fit),
  `view.follow` (Seguir / Follow). Se usan como texto, `aria-label` y `title`.

## 4. Errores y casos límite

- Rango más estrecho que 8 teclas blancas: imposible hoy (`songRange` da ≥ 2 octavas); el
  mínimo es `min(8, whiteCount)` por si acaso.
- Ancho de vista 0 (antes del primer resize): el `Viewport` no dibuja ni calcula
  seguimiento.
- Rotar la tablet: `resize` mantiene las teclas visibles y el centro.
- Pellizco con un dedo en el teclado y otro encima: el del teclado toca una nota y el otro
  arrastra. Aceptado.
- `pointercancel` termina el gesto y guarda.
- Ajustes corruptos: vuelven a los valores por defecto (validación de 3.1).

## 5. Pruebas

- `viewport.test.ts`: límites de zoom, ancla del zoom, límites del desplazamiento, `fit`,
  `resize` manteniendo el centro, `setRange`, la regla de qué se guarda, `centerOn` y
  `centerPitch`.
- `follow.test.ts`: sin candidatas → `null`; tramo dentro → `null`; movimiento mínimo a
  izquierda y derecha; prioridad por inicio cuando no caben todas; acorde más ancho que la
  vista → centrado; solo los papeles pedidos; límites del contenido.
- `render.test.ts`: `geometry` y `visibleRange` con segundos; `drawFrame` con `scrollX`
  (translate y descarte de notas fuera); barra de posición solo con zoom.
- `note-trail.test.ts`: `visible` con segundos.
- `keyboard-input.test.ts`: toque con `scrollX`.
- `view-gestures.test.ts`: con eventos sintéticos, arrastre con umbral, pellizco horizontal
  y vertical por ángulo, factor incremental con mínimo, paso de pellizco a arrastre,
  punteros que empiezan en el teclado ignorados, rueda (Ctrl, Mayús, sola, modo líneas) y
  `commit` tras 300 ms.
- `settings.test.ts`: valores por defecto, ida y vuelta, objetos inválidos.
- Prueba en el navegador (Chrome, servidor de desarrollo): botones, rueda y arrastre con
  ratón en Tocar y Tocar libre, seguimiento con una canción de demo, toque de teclas con
  zoom.

## 6. Fuera de alcance

- Nombres de octava (C3, C4…) en las teclas.
- Seguimiento en Tocar libre.
- Arrastre vertical para moverse por la canción.
- Zoom distinto por canción.
