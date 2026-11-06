# ROFE Kiosk (Android)

El proyecto Gradle también incluye `:barista` y el módulo nativo independiente
`:point` para preparar **ROFÉ Point** como Main App privada. Este último no usa el
contenedor WebView, no se instala en una Point comercial y no modifica Orders API.
Su arquitectura, builds y límites están en [ROFE_POINT.md](../docs/ROFE_POINT.md).

Contenedor Android dedicado para la terminal de autoservicio de ROFÉ en una tablet **Lenovo Tab M10** (o cualquier tablet Android 8.0+).
La APK **no contiene lógica de negocio**: carga `https://<dominio>/kiosk` y todo lo que el cliente ve (catálogo, precios, modificadores, pedidos y pagos) llega del backend y la web app existentes. Un cambio de menú o precio **no requiere una APK nueva**.

```
ROFE web app + backend (Vercel)  →  /kiosk  →  APK ROFE Kiosk (WebView)  →  M10
```

## Contenido

| Ruta | Qué hace |
| --- | --- |
| `app/src/main/java/com/rofe/kiosk/MainActivity.kt` | WebView a pantalla completa, inmersivo, inserciones (safe areas/teclado), Atrás, carga/errores, reconexión. |
| `…/admin/AdminMenu.kt` | Salida administrativa oculta (logo 5 s → PIN → menú). |
| `…/admin/LockTaskController.kt` | Lock Task, Device Owner, Home persistente. |
| `…/admin/KioskDeviceAdminReceiver.kt` | Componente necesario para Device Owner. |
| `…/boot/BootReceiver.kt` | Autoarranque tras encender o actualizar. |
| `…/core/*` | Lógica pura y probada: URL/orígenes, allowlist, PIN (PBKDF2), bloqueo por intentos. |
| `app/src/test` | Tests JVM + Robolectric (corren en CI sin emulador). |
| `app/src/androidTest` | Tests instrumentados (dispositivo o emulador). |

## Configuración por build type

| Build | Paquete | URL (por defecto) | HTTP sin cifrar | Modo kiosco al instalar | Firma |
| --- | --- | --- | --- | --- | --- |
| `debug` | `com.rofe.kiosk.debug` | `rofe.debugUrl` | Permitido (solo LAN de desarrollo) | Desactivado (app normal) | Debug |
| `staging` | `com.rofe.kiosk.staging` | `rofe.stagingUrl` | Prohibido | Activado | Release si existe, si no debug |
| `release` | `com.rofe.kiosk` | `rofe.releaseUrl` | Prohibido | Activado | Keystore release (sin keystore: APK sin firmar) |

Valores en `gradle.properties`. Se sobrescriben con `-P` o variables de entorno `ROFE_*`:

```bash
./gradlew :app:assembleDebug -Profe.debugUrl=http://192.168.0.10:5173/kiosk
```

```bash
ROFE_RELEASE_URL=https://rofe.vercel.app/kiosk ./gradlew :app:assembleRelease
```

- `rofe.extraHosts`: hosts de recursos permitidos además del dominio ROFE (por defecto `*.supabase.co`, imágenes de productos).
- `rofe.idleSeconds`: inactividad antes de "¿Sigues ahí?" (por defecto 90). Llega a la web como `?idle=90`.
- `rofe.adminPinHash`: PIN administrativo inicial opcional (ver abajo).

Staging y release **fallan al compilar** si la URL no es `https://`. En debug se puede cambiar la URL sin recompilar desde el menú admin (“Cambiar URL (solo debug)”).

## Compilar

Requisitos: JDK 17 y Android SDK (Android Studio Ladybug o más nuevo, o `sdkmanager`).

```bash
cd android-kiosk
```

```bash
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

APK debug: `app/build/outputs/apk/debug/app-debug.apk`.
GitHub Actions (`.github/workflows/android-kiosk.yml`) compila debug, staging y release en cada push que toque `android-kiosk/` y publica el artefacto **`rofe-kiosk-apk`** con `rofe-kiosk-debug.apk`, los APK de staging/release y `SHA256SUMS`.

### Firma release

No hay credenciales en el repositorio. Crea el keystore una sola vez y guárdalo fuera del repo (y en un gestor de contraseñas):

```bash
keytool -genkeypair -v -keystore rofe-release.jks -alias rofe -keyalg RSA -keysize 4096 -validity 10000
```

Compila firmado localmente:

```bash
ROFE_KEYSTORE_FILE=/ruta/segura/rofe-release.jks ROFE_KEYSTORE_PASSWORD='…' ROFE_KEY_ALIAS=rofe ROFE_KEY_PASSWORD='…' ./gradlew :app:assembleRelease
```

En GitHub Actions, agrega los secretos `ROFE_KEYSTORE_BASE64` (`base64 -w0 rofe-release.jks`), `ROFE_KEYSTORE_PASSWORD`, `ROFE_KEY_ALIAS` y `ROFE_KEY_PASSWORD`. Si se pierde el keystore no se puede actualizar la app instalada: habría que desinstalarla (y, si es Device Owner, reaprovisionar).

### Actualizaciones

- **Web** (menú, precios, diseño de `/kiosk`): se publica en Vercel; la tablet la toma en la siguiente carga o con *Recargar ROFÉ* del menú admin. El HTML se revalida siempre; los assets con hash se cachean.
- **APK** (solo si cambia código nativo): sube `versionCode` (`-Profe.versionCode=N`, CI usa el número de ejecución), compila con **el mismo keystore** e instala encima con `adb install -r`. No hay auto-actualización (sería un vector de ataque).

## PIN administrativo

- Nunca está en el código ni en el frontend. Se guarda como hash PBKDF2-SHA256 (120 000 iteraciones, sal aleatoria) en almacenamiento privado de la app, excluido de backups.
- Opción A (recomendada para varias tablets): hornear un hash inicial.
  ```bash
  ./gradlew :app:hashPin -Ppin=482915
  ```
  Copia la línea `rofe.adminPinHash=…` como secreto `ROFE_ADMIN_PIN_HASH` (CI) o `-Profe.adminPinHash=…`.
- Opción B: sin hash horneado, el **primer** toque largo pide crear el PIN en la tablet. Hazlo durante la instalación, antes de ponerla frente a clientes.
- 5 PIN incorrectos bloquean 30 s, luego 60 s… hasta 15 min.

## Seguridad de la WebView

- Navegación solo dentro del origen ROFE; enlaces externos, `intent:`, `tel:`, `market:`, `file:` y `javascript:` se bloquean. Recursos solo del dominio ROFE, `rofe.extraHosts`, `data:` y `blob:`.
- Sin `addJavascriptInterface`. La web habla con la app por `WebViewCompat.addWebMessageListener`, que solo se inyecta en el origen ROFE exacto; los mensajes no llevan secretos.
- TLS siempre validado; ante un error de certificado se cancela (nunca `proceed`). Release: HTTPS obligatorio, solo CAs del sistema.
- Sin acceso a archivos/contenido, sin geolocalización, sin cámara/micrófono, sin descargas, sin ventanas emergentes, sin selector de archivos, sin autocompletado.
- Cookies propias aceptadas (sesión `httpOnly` de ROFE); cookies de terceros rechazadas.
- Depuración remota de WebView solo en debug. Logs de release sin URLs completas, tokens ni datos de clientes.

## Comportamiento

- **Pantalla completa inmersiva** (`WindowInsetsControllerCompat`, edge-to-edge): barras ocultas; un deslizamiento las muestra temporalmente **sobre** el contenido sin mover el diseño. Si un firmware se niega a ocultarlas, a los 4 s la app reserva su espacio para que ningún botón quede debajo.
- **Safe areas y teclado**: la vista se ajusta a recortes de pantalla y al teclado (inserciones IME); la web usa `100dvh` y scroll interno, así que el CTA y el campo enfocado quedan visibles.
- **Orientación**: libre (`fullUser`); rotar no recrea la actividad ni recarga la página (carrito, modal abierto y nombre se conservan).
- **Atrás**: lo resuelve la web (cierra modal → paso anterior → nada). Nunca cierra la app.
- **Sin zoom**: `setSupportZoom(false)`, sin controles de zoom, `textZoom = 100` (escala 1:1 independiente del tamaño de fuente del sistema) y viewport `user-scalable=no` en la web.
- **Sin gestos accidentales**: sin menú de pulsación larga, sin overscroll/rebote, sin pull-to-refresh, sin arrastre de imágenes.
- **Pantalla encendida**: `FLAG_KEEP_SCREEN_ON` mientras ROFE está visible. El botón de encendido sigue funcionando y, como Device Owner, el menú de apagado sigue disponible.
- **Carga y errores**: splash nativo breve → pantalla “Conectando con ROFÉ…” → (si tarda) botón *Intentar de nuevo*. Sin conexión: “Sin conexión · Estamos intentando reconectar” con reintento automático (3 s → 30 s) y al volver la red. Nunca una página blanca ni el error del navegador.
- **Proceso de WebView caído**: se recrea la WebView sin cerrar la app.

## Modo kiosco: qué necesita Device Owner

| Función | App normal | Fijada (screen pinning) | **Device Owner** |
| --- | --- | --- | --- |
| Pantalla completa, sin zoom, Atrás bloqueado | Sí | Sí | Sí |
| Impedir salir con Inicio/Recientes | No | Parcial (se sale con Atrás+Recientes) | **Sí** |
| Entrar al bloqueo sin confirmación | — | Pide confirmar | **Sí** |
| Bloquear la barra de notificaciones | No | No | **Sí** |
| ROFE como pantalla de inicio permanente | Manual | Manual | **Sí** |
| Autoarranque tras encender (Android 10+) | No garantizado | No garantizado | **Sí** |
| Desactivar pantalla de bloqueo | No | No | **Sí** (si no hay PIN de Android) |

Para uso real frente a clientes se recomienda **Device Owner**.

## Instrucciones para la Lenovo Tab M10

> Los pasos 9 y 10 requieren **restablecer de fábrica** la tablet: Android solo permite asignar Device Owner a un dispositivo sin cuentas. Haz respaldo antes. Nada de esto se ejecuta automáticamente.

1. **Opciones de desarrollador**: *Ajustes → Acerca de la tablet* → toca 7 veces **Número de compilación**.
2. **Depuración USB**: *Ajustes → Sistema → Opciones de desarrollador → Depuración USB* → activar.
3. **Conectar ADB** (Android Platform Tools en tu computadora) con el cable USB, acepta la huella en la tablet y verifica:
   ```bash
   adb devices
   ```
4. **Instalar la APK** (descárgala del artefacto `rofe-kiosk-apk` de GitHub Actions):
   ```bash
   adb install -r rofe-kiosk-debug.apk
   ```
   Abre **ROFÉ Debug**. La primera vez registra la terminal con la clave de registro (`DEVICE_ENROLLMENT_SECRET` de Vercel).
5. **Probar pantalla completa**: no deben verse barra de estado, barra de navegación ni barra de Chrome. Desliza desde el borde: las barras aparecen unos segundos y se ocultan solas sin mover el diseño.
6. **Probar orientación**: con la rotación automática activada, gira la tablet en cada paso (bienvenida, menú, producto abierto con modificadores, pedido, nombre). Nada se recarga ni se pierde.
7. **Probar teclado**: en “¿A nombre de quién?” el campo y **CONTINUAR** quedan sobre el teclado, en vertical y en horizontal; al cerrarlo no quedan huecos.
8. **Probar modo fijado (sin Device Owner)**: mantén el logo ROFÉ 5 s → crea el PIN → *Modo kiosco: activar*. Android pide fijar la app; acepta. Inicio y Recientes quedan bloqueados (salida de emergencia de Android: mantener Atrás + Recientes).
9. **Bloqueo total con Device Owner** (recomendado en producción):
   1. *Ajustes → Sistema → Restablecer → Borrar todos los datos (restablecer de fábrica)*.
   2. En el asistente inicial **no agregues ninguna cuenta de Google** (omite ese paso); conéctate al Wi-Fi.
   3. Repite los pasos 1–3 y instala la APK **release** (o debug para pruebas).
   4. Asigna el propietario (paquete release `com.rofe.kiosk`; para debug usa `com.rofe.kiosk.debug`):
      ```bash
      adb shell dpm set-device-owner com.rofe.kiosk/.admin.KioskDeviceAdminReceiver
      ```
      Si responde *“already several accounts”* o *“already provisioned”*, falta el restablecimiento o hay una cuenta: quítala o repite 9.1.
   5. Abre ROFE: entra en bloqueo sin preguntar, se vuelve la pantalla de inicio y se bloquea la barra de notificaciones.
10. **Autoarranque**: con Device Owner es automático (pantalla de inicio persistente + `BOOT_COMPLETED`). Sin Device Owner: menú admin → *Usar ROFÉ como pantalla de inicio* y elige ROFÉ como app de inicio predeterminada. *Abrir al encender* debe estar en “sí”. Reinicia para comprobarlo:
    ```bash
    adb reboot
    ```
11. **Wi-Fi**: menú admin → *Configurar Wi-Fi* (sale del bloqueo solo mientras está abierto el panel y vuelve al regresar). Usa una red con contraseña dedicada a la terminal.
12. **Optimización de batería**: menú admin → *Optimización de batería* → *Todas las apps* → ROFÉ → *No optimizar*. En Lenovo, revisa también *Ajustes → Batería → Administración de apps en segundo plano*.
13. **Pantalla encendida**: ROFE la mantiene encendida mientras está abierta. Deja la tablet conectada al cargador. Si quieres que nunca se apague aunque ROFE no esté al frente: *Opciones de desarrollador → Pantalla activa* (mientras carga).
14. **Brillo**: *Ajustes → Pantalla* → desactiva brillo adaptativo y ajusta a ~70 % para el lugar.
15. **Notificaciones**: *Ajustes → Notificaciones* → desactiva las de todas las apps y activa *No molestar*. Con Device Owner la barra de notificaciones ya está bloqueada.
16. **Probar la salida administrativa**: mantén el logo ROFÉ (bienvenida o encabezado) **5 segundos** → PIN → menú. Verifica *Recargar*, *Salir temporalmente del modo kiosco (10 min)* y *Volver al kiosco*. Un PIN incorrecto 5 veces bloquea el acceso temporalmente.

## Comandos ADB útiles

Instalar o actualizar (conserva datos; misma firma):

```bash
adb install -r rofe-kiosk-debug.apk
```

Ver paquetes instalados de ROFE:

```bash
adb shell pm list packages | grep rofe
```

Logs de la app (en release solo advertencias y errores):

```bash
adb logcat -s ROFEKiosk
```

Logs de la WebView/consola web en debug (además puedes usar `chrome://inspect` en Chrome de tu computadora):

```bash
adb logcat -s ROFEKiosk chromium
```

Comprobar Device Owner:

```bash
adb shell dpm list-owners
```

Abrir la app desde la computadora:

```bash
adb shell am start -n com.rofe.kiosk.debug/com.rofe.kiosk.MainActivity
```

**Quitar Device Owner (solo desarrollo)**: menú admin → *Quitar Device Owner (desarrollo)*. Desde ADB solo es posible si la app es `testOnly`, por eso existe la opción en el menú. Después ya se puede desinstalar:

```bash
adb uninstall com.rofe.kiosk.debug
```

⚠️ `adb shell pm clear <paquete>` borra el registro de la terminal y el PIN; habrá que registrarla de nuevo. Un restablecimiento de fábrica borra todo.

## Tests

- `./gradlew :app:testDebugUnitTest`: lógica pura (allowlist, URLs, PIN, bloqueo) + Robolectric (la actividad inicia, carga la URL, WebView sin zoom ni acceso a archivos, Atrás no sale, `configChanges` de rotación, error de red con reintento, mensajes solo del origen ROFE, navegación externa bloqueada, diálogo admin).
- `./gradlew :app:connectedDebugAndroidTest`: en tablet/emulador (inmersivo, Atrás, rotación sin recrear la WebView, recarga, admin). En CI se ejecuta con *Run workflow* (`emulator: true`).

## Limitaciones conocidas del firmware

- **Lenovo / Android 9–11**: algunos firmwares muestran brevemente la barra de navegación al abrir el teclado; la app la oculta de nuevo al cerrarlo.
- **Sin Device Owner** Android 10+ puede impedir el autoarranque desde `BOOT_COMPLETED` (restricción de inicio en segundo plano). La alternativa compatible es usar ROFÉ como pantalla de inicio.
- La salida de emergencia de *screen pinning* (Atrás + Recientes) es del sistema y no se puede desactivar sin Device Owner.
- La WebView se actualiza desde Google Play (*Android System WebView*). Mantenla actualizada: versiones antiguas pueden no soportar `100dvh` o el puente `WebMessageListener` (en ese caso el acceso admin sigue disponible desde el logo de la pantalla de carga nativa).
