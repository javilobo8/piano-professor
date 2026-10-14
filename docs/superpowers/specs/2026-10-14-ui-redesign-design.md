# Rediseño de la interfaz — Diseño

Fecha: 2026-10-14
Estado: aprobado (dirección y distribución elegidas por el usuario con maquetas; resto con aprobación automática, preferencia del proyecto)

## 1. Objetivo

Toda la interfaz pasa a un estilo **mucho más profesional** y **cómodo en tablets y móviles**
(vertical y horizontal). Lo pidió el usuario el 2026-10-14; la implementación la hacen
subagentes con Opus 5.5.

Decisiones del usuario (con maquetas en el navegador):

- **Dirección visual C · "Neón moderno"**: azul noche, degradado violeta → cian, tarjetas de
  cristal, tipografía Plus Jakarta Sans, juvenil pero cuidado.
- **Pantalla de tocar B · "Inmersiva"**: las notas ocupan toda la pantalla y los controles son
  cápsulas de cristal flotantes que se atenúan mientras tocas.
- **Móvil**: menús en vertical y en horizontal; Tocar y Tocar libre también se adaptan al
  vertical. Se quita el bloqueo a horizontal del PWA.
- Colores de las manos en el canvas: derecha **cian**, izquierda **violeta** (mostrados en la
  maqueta; sin objeción).

### Criterios de éxito

- Ninguna pantalla tiene scroll horizontal ni textos o controles cortados a 360 × 640, 390 × 844,
  844 × 390, 800 × 1280 y 1280 × 800 (CSS px).
- Todos los objetivos táctiles miden al menos 44 × 44 px (los principales 48 px).
- Se ve igual sin conexión: la fuente y los iconos van dentro de la app.
- Tocar mantiene 60 fps en la tablet: el nuevo dibujo del canvas no usa `shadowBlur` ni crea
  gradientes u otros objetos por nota y frame.
- Todo lo que existe hoy sigue funcionando (mismas funciones, mismos textos traducidos, zoom,
  seguimiento, bucle, escucha, resultados).

## 2. Sistema visual

### 2.1 Tokens (en `src/app.css`, `:root`)

| Token | Valor |
|---|---|
| `--bg` | `#0a0c16` |
| `--bg-glow` | `radial-gradient(900px 420px at 0% 0%, rgba(124,92,255,.22), transparent 60%), radial-gradient(800px 400px at 100% 100%, rgba(34,211,238,.14), transparent 60%)` |
| `--surface` | `rgba(255,255,255,.05)` |
| `--surface-2` | `rgba(255,255,255,.08)` |
| `--surface-solid` | `#12152a` (hojas, menús, diálogos) |
| `--glass` | `rgba(18,20,38,.6)` con `backdrop-filter: blur(14px)` |
| `--border` | `rgba(255,255,255,.10)` |
| `--border-strong` | `rgba(255,255,255,.18)` |
| `--text` | `#eef0ff` |
| `--text-dim` | `#9aa0c3` |
| `--text-faint` | `#6b7196` |
| `--violet` | `#7c5cff` |
| `--cyan` | `#22d3ee` |
| `--accent-gradient` | `linear-gradient(135deg, #7c5cff, #22d3ee)` |
| `--accent-soft` | `rgba(124,92,255,.35)` (segmento elegido, foco suave) |
| `--success` | `#34d399` |
| `--warning` | `#fbbf24` |
| `--danger` | `#f87171` |
| `--right` / `--left` | `#22d3ee` / `#a78bfa` |
| `--radius-sm` / `--radius` / `--radius-lg` / `--radius-pill` | `10px` / `14px` / `18px` / `999px` |
| `--tap` / `--tap-sm` | `48px` / `44px` |
| `--shadow-glow` | `0 8px 24px -8px rgba(124,92,255,.8)` |
| `--shadow-pop` | `0 20px 40px -16px rgba(0,0,0,.7)` |
| `--font` | `'Plus Jakarta Sans Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` |

Tipografía: títulos de pantalla 28 px / 800 / `letter-spacing: -.02em` (24 px en móvil);
secciones 18 px / 700; texto 15 px / 500; secundario 13 px; etiquetas 11.5 px / 700 /
mayúsculas / `letter-spacing: .08em`. Números con `font-variant-numeric: tabular-nums`.
Espaciado en múltiplos de 4 px.

### 2.2 Elementos base

- **Botones**: `primary` (fondo `--accent-gradient`, texto blanco, `--shadow-glow`), normal
  (cristal: `--surface-2` + `--border`), `ghost`, `danger` (texto y borde `--danger`) e
  **icono** (cuadrado `--tap-sm`, radio `--radius-sm`). Estados `:hover` solo con
  `@media (hover: hover)`, `:active` con leve escala (0.97), `:disabled` con opacidad .45.
- **Foco**: `:focus-visible` con anillo de 2 px `--cyan` y separación de 2 px.
- **Segmentado** (`Segmented.svelte`): contenedor píldora (`--surface`, `--border`, padding
  3 px); opción elegida con `--accent-soft` y texto blanco; las etiquetas no se parten
  (`white-space: nowrap`); con la prop `full` ocupa todo el ancho repartido a partes iguales.
- **Interruptor**: las casillas de activar/desactivar pasan a interruptor (`role="switch"`),
  pista de 44 × 26 px, activo con `--accent-gradient`.
- **Deslizadores**: pista fina, relleno con el degradado, pulgar blanco de 20 px.
- **Selects y campos**: cristal, radio `--radius-sm`, altura `--tap`.
- **Tarjetas**: `--surface` + `--border` + `--radius-lg`, ligero degradado interior.
- **Iconos**: `@lucide/svelte` (ISC), versión fija `1.48.0`, importando cada icono por
  separado (se empaquetan solo los usados): ArrowLeft, Play, Pause, Plus, Settings, Piano,
  Ellipsis, Pencil, Trash2, X, Check, Repeat, Minus, Maximize2, Crosshair, Bluetooth, Usb,
  Volume2, Headphones, Music, RotateCcw, ChevronRight, Gauge, Hand… Tamaño 18–20 px, trazo 2;
  `aria-hidden` siempre; el texto accesible va en el botón. Los emojis y símbolos sueltos
  (⚙ ✎ 🗑 🎹 ▶ ❚❚ ＋) desaparecen.
- **Fuente**: `@fontsource-variable/plus-jakarta-sans` (OFL), versión fija `5.3.0`, importada en `main.ts` (Vite la
  empaqueta; el precache de Workbox incluye `woff2`).
- **Movimiento**: transiciones de 150–250 ms; con `prefers-reduced-motion: reduce` no hay
  transiciones ni animaciones.

### 2.3 Disposición general

- `#app` usa `100dvh`; cada pantalla de menú hace scroll dentro de sí misma con márgenes de
  `env(safe-area-inset-*)`.
- Puntos de corte: móvil `< 600px`, tablet `600–1023px`, ancho `≥ 1024px` (por ancho), más
  `(orientation: portrait)` donde ayude.
- Fondo de las pantallas de menú: `--bg` con `--bg-glow`.
- Manifest: `orientation: 'any'`, `background_color` y `theme_color` `#0a0c16`
  (también `<meta name="theme-color">`).

## 3. Componentes compartidos nuevos

- `AppHeader.svelte`: marca (cuadro con el degradado e icono `piano` + "Piano Professor") o
  botón volver + título; a la derecha la píldora de conexión y el botón de ajustes. En móvil
  el título se recorta con elipsis y la píldora muestra solo el punto.
- `ConnectionBadge.svelte` (rehecho): píldora de cristal con punto de estado (verde con halo
  si conectado, ámbar si conectando, rojo si no) y nombre; prop `compact` solo punto.
- `Sheet.svelte`: panel de opciones. En pantallas `< 720px` de ancho es una **hoja inferior**
  (fondo `--surface-solid`, radio superior `--radius-lg`, asa, máx. `75dvh` con scroll,
  respeta el área segura inferior); en pantallas anchas es un **panel flotante** anclado arriba
  a la derecha (ancho 360 px). Fondo oscuro detrás que cierra al tocar; `Escape` cierra; el
  foco va al panel al abrir y vuelve al botón que lo abrió al cerrar. Props: `open`,
  `title`, `onclose`, contenido por `children`.
- `idle-dimmer.ts` (puro, con pruebas): `createIdleDimmer({ delayMs, onChange })` →
  `{ poke(), setEnabled(enabled), dispose() }`. Con `enabled`, tras `delayMs` sin `poke()`
  llama `onChange(true)` (atenuado); un `poke()` o `setEnabled(false)` llama `onChange(false)`
  si estaba atenuado y reinicia la cuenta. No repite llamadas con el mismo valor.

## 4. Pantallas

### 4.1 Biblioteca

- `AppHeader` con la marca.
- **Tarjeta destacada** (degradado violeta→cian suave, borde claro):
  - Si hay prácticas guardadas: "Seguir practicando", título de la última canción practicada,
    mano · modo · mejor %, botones *Tocar libre* y **▶ Continuar** (abre Tocar con esa mano y
    modo y la última velocidad).
  - Si no: bienvenida breve, *Añadir canción* (principal) y *Canción de demo*.
  - La última práctica sale de un helper puro `latestPractice(records)` (pruebas) que elige el
    registro con la ejecución más reciente (`history[0].date`).
- Barra: título "Biblioteca" con el número de canciones, *Tocar libre* y **＋ Añadir canción**.
- **Rejilla de tarjetas** `repeat(auto-fill, minmax(260px, 1fr))` (una columna en móvil):
  título (2 líneas como máximo), duración, mejores resultados por mano como barras finas con
  el degradado y el %, botón ▶ (abre la preparación) y menú ⋯ con *Renombrar* y *Eliminar*
  (la confirmación y el renombrado siguen siendo en línea dentro de la tarjeta).
- Errores de importación: aviso con borde `--danger` encima de la rejilla, que se puede cerrar.

### 4.2 Preparar canción

- `AppHeader` con volver y el título de la canción.
- Ancho `≥ 1024px`: dos columnas (Pistas | Práctica). Menos: una columna (Práctica primero en
  móvil, porque es lo que más se toca; Pistas después).
- **Práctica**: Mano (segmentado a todo el ancho), Modo (segmentado + explicación), Velocidad
  (deslizador con la cifra en una pastilla), sección Sonido (salida, interruptor "Tocar las
  otras partes", volumen).
- **Pistas**: filas con nombre, información, select de papel e icono ▶/■ de escucha;
  interruptor "Separar por altura" y deslizador del punto de corte.
- **Acciones** *Escuchar la canción* y **▶ Empezar**: al pie de la tarjeta de Práctica en
  tablet; en móvil, barra fija abajo de cristal con el área segura.

### 4.3 Ajustes

- `AppHeader` con volver y "Ajustes".
- Rejilla de tarjetas `repeat(auto-fit, minmax(300px, 1fr))`: **Piano** (estado, dispositivo
  USB, buscar otra vez, conectar por Bluetooth, nota), **Pantalla** (idioma, nombres de notas,
  teclado, interruptores de nombres y acompañamiento), **Sonido** (salida, otras partes,
  volumen). Cada tarjeta con icono y título.

### 4.4 Tocar (inmersiva)

- El canvas ocupa toda la pantalla (`100dvh`). Encima, **cápsulas de cristal** (`--glass`)
  con margen del área segura:
  - **Arriba izquierda**: volver e ▶/❚❚ (el de reproducir con el degradado).
  - **Arriba centro** (flexible): barra de progreso (toque para buscar, zona del bucle
    marcada) y tiempo.
  - **Arriba derecha**: pastilla de velocidad (%), pastilla de mano, punto de conexión y ⋯.
  - **Móvil vertical** (`< 600px`): una sola cápsula a lo ancho: volver, ▶/❚❚, progreso, ⋯.
- **Panel de opciones** (`Sheet`, se abre con ⋯ o con las pastillas): Mano (Derecha /
  Izquierda / Ambas / Escuchar), Velocidad (− % +), Bucle A–B (activar, desde/hasta con − +,
  puntuación de la vuelta), Vista (↔ − +, ↕ − +, Ajustar). El panel flotante de zoom actual
  (`ViewControls`) pasa a ser esta sección.
- **Seguir**: pastilla flotante bajo la barra superior cuando el seguimiento está en pausa.
- **Atenuado**: mientras suena y el panel está cerrado, a los 3 s sin tocar la pantalla las
  cápsulas bajan a opacidad .35; cualquier toque, movimiento de puntero o cambio de estado
  las devuelve a 1 (`idle-dimmer`).
- **Resultados** y **fin de la escucha**: tarjetas de cristal centradas; el % grande con
  texto en degradado, las cifras en una rejilla, botones *Repetir* y *Biblioteca* / *Escuchar
  otra vez* y **Practicar**.
- Mientras el panel está abierto la canción no se pausa sola (como hoy con la barra).

### 4.5 Tocar libre (inmersiva)

- Canvas a pantalla completa con las mismas cápsulas: volver + "Tocar libre"; en el centro
  las notas que suenan (pastilla, se oculta si no hay); a la derecha conexión, ajustes y ⋯
  (panel con la sección Vista). Mismo atenuado tras 3 s cuando hay notas sonando o al tocar.
- La pista de ayuda inicial queda centrada en el canvas con el estilo nuevo.

### 4.6 Canvas (falling notes) — `render/colors.ts` y `render/renderer.ts`

Paleta:

| Uso | Valor |
|---|---|
| fondo | `#090b16` |
| calle bajo tecla negra | `#070913` |
| línea de compás | `rgba(255,255,255,0.06)` |
| sombra del bucle | `rgba(124,92,255,0.08)` |
| derecha / derecha en tecla negra / halo | `#22d3ee` / `#0e9fbd` / `rgba(34,211,238,0.28)` |
| izquierda / izquierda en tecla negra / halo | `#a78bfa` / `#7c5cff` / `rgba(167,139,250,0.30)` |
| acompañamiento | `#64748b` |
| tecla mal tocada | `#fb7185` |
| tecla neutra (sin juzgar) | `#e2e8f0` |
| tecla esperada | `rgba(251,191,36,0.55)` |
| brillo superior de nota | `rgba(255,255,255,0.35)` |
| etiqueta dentro de la nota | `rgba(8,10,22,0.8)` |
| tecla blanca / sombra inferior / borde | `#eef1fb` / `#cfd5ea` / `#9aa3c0` |
| tecla negra / reflejo superior | `#1a1d2e` / `#2b2f45` |
| línea de golpeo | degradado `#7c5cff` → `#22d3ee` + franja de halo `rgba(34,211,238,0.25)` de 6 px |
| barra de posición (pista / tramo) | `rgba(255,255,255,0.08)` / `rgba(34,211,238,0.6)` |

Dibujo:

- **Halo** de cada nota: un rectángulo redondeado 3 px más grande en cada lado con el color de
  halo, dibujado antes de la nota. Sin `shadowBlur`.
- **Brillo**: franja de 2 px arriba de la nota con el color de brillo.
- Las notas atenuadas (otra mano, acompañamiento) no llevan halo ni brillo.
- **Teclado**: teclas blancas con degradado vertical blanco → sombra inferior; negras con
  reflejo superior. Los degradados (teclado, línea de golpeo) se crean **una vez por
  geometría** (al cambiar tamaño, altura del teclado o zoom) y se reutilizan, nunca por frame.
- Teclas pulsadas y escuchadas usan el color de la mano/estado como hoy.
- Las pruebas de `render.test.ts` cambian los colores esperados a la paleta nueva.

## 5. Textos

Se añaden las claves que hagan falta en `en.ts` y `es.ts` a la vez (la prueba de i18n exige
las mismas claves), por ejemplo `library.continueTitle`, `library.continue`,
`library.welcome`, `library.count`, `common.more`, `common.close`, `play.options`,
`play.view`, `setup.practice`. Textos actuales que ya existen se reutilizan.

## 6. Pruebas

- Unitarias: `idle-dimmer` (temporizadores falsos), `latestPractice`, paleta y dibujo del
  canvas actualizados, y todo lo existente en verde.
- `npm run check` sin errores ni avisos; `npm run build` correcto.
- Revisión visual en Chrome (sesión coordinadora) a 360 × 640, 390 × 844, 844 × 390,
  800 × 1280 y 1280 × 800 de cada pantalla, con la canción de demo, resultados y el panel de
  opciones abiertos.

## 7. Fuera de alcance

- Tema claro o cambio de tema.
- Nuevas funciones (salvo "Seguir practicando", que reutiliza datos existentes).
- Cambiar el motor, MIDI, audio o el comportamiento del zoom.
- Animaciones de las notas al acertar (partículas, destellos).
