# ROFÉ · Terminal de autoservicio (`/kiosk` + APK Android)

Informe técnico de la terminal para la tablet Lenovo Tab M10. Instalación de la tablet: [`android-kiosk/README.md`](../android-kiosk/README.md).

## 1. Arquitectura final

```
Backend Express + Supabase (Vercel /api)     ← única fuente de catálogo, precios, pedidos y pagos
        │
Web app React (Vercel)
  ├── /        POS (iPad), Barista/KDS, Admin   ← sin cambios de comportamiento
  ├── /pedir   pedidos QR (Stripe)               ← sin cambios
  └── /kiosk   terminal de autoservicio          ← KioskPage → App(kiosk) → KioskTerminal
        │        reutiliza Catalog, Cart, ProductModal, CheckoutModal, useCheckout,
        │        outbox offline, autenticación de terminal (POS_DEVICE) y el mismo API
        │
APK ROFE Kiosk (android-kiosk/, Kotlin)       ← contenedor: WebView + plataforma Android
        │
Tablet M10
```

No hay lógica de negocio duplicada: el kiosco crea pedidos con el mismo `POST /api/orders`, el mismo `operationId` idempotente y el mismo cálculo de precios en el backend. La APK solo carga la URL; cambios de catálogo o de la web no requieren una APK nueva.

## 2. Diagnóstico inicial (causas raíz)

| Síntoma en la tablet | Causa raíz |
| --- | --- |
| CTA inferior tapado o fuera de pantalla en vertical | Por debajo de 1024 px el POS apilaba el carrito *debajo* del catálogo y por debajo de 600 px pasaba a scroll de página (`overflow: visible`, alturas mínimas fijas de 480/300 px). El CTA quedaba fuera del viewport. |
| Elementos pegados o bajo las barras de Android | Ningún contenedor del POS aplicaba `safe-area-inset-*`; `#root` usaba `100vw/100vh`. En Chrome las barras del navegador y del sistema reducen el área visible y `100vh` no lo refleja. |
| Mal aprovechamiento / espacios vacíos al rotar | Breakpoints solo por ancho; el mismo layout de escritorio encogido. |
| Teclado tapando el nombre | El viewport no declaraba `interactive-widget`; el diálogo de pago no tenía altura máxima con scroll interno. |
| Zoom y UI del navegador | Viewport con zoom permitido; se usaba Chrome/PWA, con barra de URL fuera de modo instalado. |
| Botón "Equipo" visible al cliente, salida accidental | `/kiosk` reutilizaba la vista POS tal cual. |

## 3. Cambios web (compartidos, sin cambio de comportamiento en POS)

- `Catalog`: props opcionales `showSearch` y `priorityImages` (primeras imágenes `eager`/`fetchpriority=high`, resto `lazy`, `decoding=async`, tamaño intrínseco para evitar saltos de layout, sin arrastre).
- `ProductModal` y `CheckoutModal`: se registran en la pila de "Atrás" (`useBackHandler`). El POS no la usa, así que no cambia.
- `CheckoutModal`: prop opcional `kiosk` (oculta el descuento con autorización de gerente, autocompletado desactivado, cuenta regresiva y regreso automático tras confirmar, vibración opcional) y `onLockChange` (bloquea la inactividad mientras hay un pago en curso).
- `App`: con `kiosk` usa `KioskTerminal`, persiste el pedido en curso en `sessionStorage` y escucha `rofe-kiosk-reset` / `rofe-kiosk-staff`.
- `index.html`: en `/kiosk`, viewport sin zoom aplicado antes del primer pintado.
- `manifest.webmanifest`: `orientation: any` (vertical y horizontal); validadores PWA actualizados.
- `vite.config.ts`: inyecta la versión web (`__ROFE_WEB_VERSION__`, versión + commit de Vercel) que ve el menú admin de la APK; proxy de `/health` en desarrollo.

## 4. `/kiosk`

Módulos en `src/kiosk/`:

| Archivo | Responsabilidad |
| --- | --- |
| `KioskTerminal.tsx` | Bienvenida, encabezado, catálogo, pedido (columna o bottom sheet), barra de pedido con CTA, pantallas de sin conexión, "¿Sigues ahí?" y confirmación de cancelación. |
| `KioskDialog.tsx` | Diálogo táctil accesible (`alertdialog`) con cuenta regresiva opcional. |
| `config.ts` | Ajustes por URL desde la APK: `idle`, `idlePrompt`, `confirm`, `haptics`, con límites seguros. |
| `session.ts` | Pedido en curso en `sessionStorage`, válido solo durante el tiempo de inactividad. |
| `useIdleTimer.ts` | Inactividad sin re-renders por toque. |
| `useReachability.ts` | Conexión real (sondeo de `/health`), no solo `navigator.onLine`. |
| `useMediaQuery.ts` | `useStackedLayout()`: layout por orientación **física** de la pantalla. |
| `backStack.ts` | Pila de "Atrás" (diálogo → paso anterior → raíz, que se consume). |
| `guards.ts` | Viewport sin zoom, bloqueo de pinch/ctrl+rueda/menú contextual/arrastre/selección fuera de inputs, foco visible sobre el teclado, Atrás del navegador hacia la pila. |
| `nativeBridge.ts` | Contrato con la APK (`window.rofeNative`, `window.rofeKiosk`). |

Flujo: bienvenida → ORDENAR AQUÍ → categoría → producto → modificadores → pedido → nombre → método de pago → creación del pedido → confirmación con número → regreso automático e inicio limpio.

Sesión por cliente: al confirmar se muestra el número; tras `confirm` segundos (12 por defecto) o al tocar *Entendido* se vacían pedido, nombre, modificadores, producto abierto, categoría y `sessionStorage`. Nunca se muestran datos del cliente anterior.

Inactividad (configurable, 90 s por defecto): con pedido parcial pregunta "¿Sigues ahí?" (Continuar pedido / Cancelar). Si nadie responde en `idlePrompt` segundos (20 por defecto), cancela y vuelve al inicio. Sin pedido vuelve al inicio sin preguntar. Con un pago en curso nunca reinicia.

## 5. Responsive vertical / horizontal

- Página de altura fija (`100dvh`) con regiones que hacen scroll interno (`minmax(0,1fr)`, `min-height: 0`). Nada desplaza la página, así que el CTA nunca se va de la pantalla.
- **Horizontal**: catálogo (~66 %) + columna de pedido persistente `clamp(320px, 34%, 440px)` con CTA fijo abajo.
- **Vertical** (o ancho < 760 px): encabezado → categorías horizontales → catálogo → **barra de pedido persistente** (conteo, total y *Continuar*), con bottom sheet del pedido con scroll interno. Personalización como bottom sheet; pago como diálogo centrado con scroll.
- El layout se decide por la **orientación física** (`screen`), no por el viewport: al abrir el teclado en vertical el viewport se vuelve "apaisado" y una media query cambiaría el diseño mientras el cliente escribe.
- Se reutiliza **la misma instancia** de `Cart` en ambas orientaciones (solo cambia el CSS), así que rotar no desmonta nada.
- Las reglas responsive del POS que se filtraban (`overflow: visible`, alturas mínimas, `grid-auto-rows`, padding inferior de 76 px) se neutralizan dentro de `.kiosk-shell`.
- Tarjetas con `grid-auto-rows: max-content` (con `overflow: hidden` el mínimo automático es 0 y las filas `auto` se encogían).

## 6. Pantalla completa

- APK: `WindowCompat.setDecorFitsSystemWindows(false)` (edge-to-edge) + `WindowInsetsControllerCompat.hide(systemBars())` con `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`; se reaplica al recuperar el foco, al rotar y al volver de diálogos. Recortes de pantalla con `LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS/SHORT_EDGES`.
- Barras temporales (deslizamiento) se superponen sin mover el layout. Si el firmware deja las barras fijas, a los 4 s se reserva su espacio.
- Sin barra de Chrome: es una WebView propia, sin URL, pestañas ni menú.

## 7. Anti-zoom

- Web: viewport `width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content` (solo en `/kiosk`, aplicado antes del primer pintado), `touch-action: pan-x pan-y`, bloqueo de pinch (`touchmove` con 2 dedos), `gesturestart`, ctrl+rueda y ctrl +/-. Inputs a ≥ 16 px para que el foco no haga zoom.
- APK: `setSupportZoom(false)`, `builtInZoomControls = false`, `displayZoomControls = false`, `textZoom = 100` (escala 1:1 aunque el usuario cambie el tamaño de fuente del sistema).
- El resto de la app (POS/admin en el navegador) conserva el zoom por accesibilidad.

## 8. Safe areas

- En la APK, la vista raíz se rellena nativamente con las inserciones de recorte de pantalla, teclado (IME) y, solo si las barras forman parte del layout, barras del sistema. Dentro de la WebView `env(safe-area-inset-*)` vale 0 y no hay doble margen.
- En Chrome/PWA, `env(safe-area-inset-*)` se aplica una vez en `.kiosk-terminal`, en el bottom sheet y en los overlays fijos.

## 9. Teclado

- APK: `adjustResize` + inserciones IME → la WebView se reduce sobre el teclado; el diseño no cambia de orientación.
- Web: `interactive-widget=resizes-content`, diálogos con `max-height: 100%` y scroll, y `scrollIntoView({block:'center'})` del campo enfocado. Al cerrar el teclado el viewport vuelve a su altura completa y no quedan huecos (test E2E con métricas de pantalla vertical).

## 10. Conectividad

- Web: sondeo de `/health` (20 s en línea / 4 s sin conexión; 2 fallos = sin conexión). Pantalla "Sin conexión · Estamos intentando reconectar. Tu pedido se conserva" sobre el menú. Al volver, desaparece y el pedido sigue igual. Durante el pago no se cubre: el flujo de pago ya recupera el mismo pedido sin reenviar el cobro.
- APK: si la página no carga, pantalla nativa con marca ("Sin conexión" / "No pudimos conectar con ROFÉ"), reintento automático con espera creciente (3 → 30 s) y al validarse la red; nunca la página de error de la WebView.

## 11. Idempotencia

- Ya existía y se reutiliza: cada intento de pago tiene un `operationId` (UUID) guardado *antes* de enviarse; el backend rechaza duplicados por `operation_id` único y el proveedor recibe la misma clave de idempotencia. Un `inFlight` ref evita dobles envíos y los botones se deshabilitan mientras hay operación.
- E2E: un doble toque en *Pago en efectivo* produce exactamente una petición `POST /api/orders`.
- Recarga o reconexión durante el pago: se recupera el borrador guardado y se consulta el pedido existente (solo lectura); reenviar es un reintento explícito con el mismo `operationId`.

## 12. Seguridad

Web: sin secretos en el frontend; descuentos de gerente ocultos en el kiosco; autocompletado desactivado en el nombre (tablet compartida); acceso de equipo por pulsación larga de 5 s del logo, con el login de servidor existente.
APK: ver la sección *Seguridad de la WebView* de `android-kiosk/README.md` (allowlist de origen, sin puentes JS inseguros, TLS estricto, HTTPS obligatorio en release, sin acceso a archivos, sin backups, logs saneados, PIN PBKDF2 con bloqueo progresivo).

## 13. Rendimiento

- Sin `backdrop-filter` (blur) ni sombras pesadas en el kiosco; transiciones de 90–220 ms solo en `transform`/`opacity`.
- `useIdleTimer` y la pulsación larga usan refs (cero renders por toque); `KioskWelcome` memoizado; el layout se decide con `useSyncExternalStore`.
- Imágenes WebP/JPEG existentes, primeras 6 con prioridad, resto diferidas; tamaño intrínseco para evitar recálculos de layout. Precarga solo de lo visible (no se precarga todo el catálogo).
- El bundle del kiosco no añade dependencias.

## 14. Tests

- Unitarios web (`src/kiosk/kiosk.test.ts`): configuración, pila de Atrás, expiración y limpieza de la sesión.
- E2E Playwright, perfiles **M10 landscape** (1280×800) y **M10 portrait** (800×1280) con táctil (`e2e/kiosk-terminal.spec.ts`): zoom bloqueado y CTA visible, flujo completo con doble toque y reinicio automático, rotación sin perder pedido ni modal ni modificadores, teclado virtual simulado en vertical, inactividad con reloj simulado, sin conexión y recuperación, Atrás, cancelación, viewports pequeños, acceso de equipo por pulsación larga. Cada test corre en ambos perfiles (22 en total).
- Suite existente (POS, KDS, admin, pagos, PWA): 52 tests en verde tras los cambios.
- Android: ver `android-kiosk/README.md` → *Tests*.

## 15. Resultados de build (rama `claude/android-kiosk-m10`)

| Verificación | Resultado |
| --- | --- |
| Web: lint, typecheck, tests unitarios (17), build de producción, validación PWA | OK |
| Web E2E: suite completa (POS, KDS, admin, pagos, PWA) + 22 del kiosco en perfiles M10 | OK |
| CI web (`ci.yml`, incluye PostgreSQL) | OK |
| Android: tests JVM + Robolectric (21) | OK |
| Android lint (debug) y lint vital (staging/release) | OK |
| APK debug, staging y release (R8 + reducción de recursos) | OK |
| Tests instrumentados en emulador de tablet API 34 (5) | OK |

**APK**: artefacto **`rofe-kiosk-apk`** del workflow *Android kiosk* en GitHub Actions (pestaña *Actions → Android kiosk →* última ejecución *→ Artifacts*). Contiene `rofe-kiosk-debug.apk` (instalable de inmediato, apunta a `https://rofe.vercel.app/kiosk`), `app-staging.apk` (firmado con la clave debug mientras no exista keystore release), `app-release-unsigned.apk` y `SHA256SUMS`. Los artefactos expiran a los 30 días; volver a ejecutar el workflow genera uno nuevo.
