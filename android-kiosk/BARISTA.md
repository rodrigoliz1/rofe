# ROFÉ Barista — segunda terminal

El módulo `:barista` produce una aplicación independiente que comparte el código nativo de `:app`, la interfaz `BaristaView`, los servicios y el backend de ROFÉ. No contiene otra implementación de recetas, pagos ni inventario.

| Aplicación | Debug | Release | Entrada |
|---|---|---|---|
| ROFÉ Kiosco | `com.rofe.kiosk.debug` | `com.rofe.kiosk` | `/kiosk` |
| ROFÉ Barista | `com.rofe.barista.debug` | `com.rofe.barista` | `/barista` |

Identidades, iconos, preferencias privadas, cookies/WebView, versiones, keystores y artefactos independientes. Las clases comunes conservan el namespace `com.rofe.kiosk`; esto no cambia el applicationId instalado. La APK de cliente no recibe cámara ni cambia su URL o valores de operación por defecto.

## Instalar la APK debug local

Los archivos de entrega se conservan en `android-kiosk/dist/` (ignorados por Git). `ROFE-Barista.apk` y `ROFE-Kiosco.apk` son las builds debug para pruebas locales mediante USB. No sustituyen una instalación release existente. Requieren que esta Mac mantenga abierto `npm run dev`.

1. En la M10 #2 activa Opciones de desarrollador → Depuración USB y conecta el cable. Autoriza esta Mac en la tablet.
2. Desde la carpeta del proyecto. En esta Mac el SDK se conservó dentro del perfil local; este alias permite usarlo sin instalar nada globalmente:

```sh
alias adb="$PWD/.rofe-local/android-toolchain/sdk/platform-tools/adb"
adb devices
adb install -r android-kiosk/dist/ROFE-Barista.apk
adb reverse tcp:5173 tcp:5173
adb shell am start -n com.rofe.barista.debug/com.rofe.kiosk.MainActivity
```

La build de prueba abre `http://127.0.0.1:5173/barista`, que llega a esta Mac por el túnel USB. El proxy de Vite llega al backend local; no usa pedidos ni pagos de producción. Repite el túnel al reconectar USB. Con dos tablets, usa `adb -s SERIAL ...` para cada instrucción y en la M10 #1 instala `ROFE-Kiosco.apk`. El kiosco local requiere su registro de terminal; Barista requiere la cuenta de personal existente, sin registro POS. No se restablecieron contraseñas del dueño.

También puedes copiar una APK a la tablet e instalarla permitiendo temporalmente «Instalar aplicaciones desconocidas» a la aplicación de archivos. Para esta build local el túnel USB sigue siendo necesario. Retira el permiso de instalar al terminar.

Para un backend de desarrollo HTTPS accesible sin cable, compila con `-Pbarista.debugUrl=https://TU-ENTORNO/barista`. No uses una IP HTTP para la cámara: `getUserMedia` requiere un contexto seguro (HTTPS o loopback). No pongas contraseñas, tokens, `.env` ni claves en la APK.

## Operación

El inicio muestra autenticación de personal. ADMIN, MANAGER y BARISTA acceden a barra; el backend protege sesión, pedidos, cambios de estado, cobros y cupones con sus permisos propios. Un token POS no puede consultar la cola ni la sesión Barista. El PIN nativo protege configuración de tablet y no sustituye la autenticación del servidor.

SSE reutiliza el backend existente: broadcasts inmediatos en una instancia, sondeo de persistencia entre instancias cuando `REALTIME_POLL_MS` está activo (3 s por defecto en Vercel), heartbeat y reconexión al terminar la Function. La página recupera pedidos al reconectar y usa sondeo de respaldo cada 15 s. La cola permanece visible sin red, pero el servidor debe confirmar cobros y estados. Suspender/reanudar reconstruye la suscripción.

Una alerta sonora cubre el lote de pedidos nuevos recibido; el registro por UUID, usuario y origen evita alertar de nuevo al cobrar, duplicar eventos o recargar. Si el navegador requiere interacción para sonido, se ofrece «Activar sonido». El origen se muestra como Kiosco, POS o Pickup · QR. La marca KIOSK es metadato informativo, no un privilegio.

Las recetas resueltas e instrucciones muestran unidades exactas; la captura de cada pedido conserva los ingredientes y costos del momento de venta. La cola, los pagos por denominaciones, emisión/redención de cupones y preparación comparten la implementación web existente. El rol BARISTA no obtiene Administración ni funciones para borrar historial.

La pantalla se mantiene encendida y en modo inmersivo. Orientación principal horizontal con cambios de teclado/rotación manejados sin recrear la WebView. «Opciones de tablet» → PIN permite configuración, inicio automático opcional (apagado inicialmente en Barista) y modo terminal dedicada. Device Owner es opcional y requiere el procedimiento de instalación del README; Android permite un solo Device Owner por dispositivo. No intentes asignar ambos paquetes como Device Owner en la misma tablet.

## Cámara

Sólo el manifiesto de Barista contiene CAMERA. No se declara micrófono, almacenamiento, ubicación ni permisos de superposición. Al presionar «Escanear QR» se solicita vídeo; Android solicita CAMERA si falta. El shell exige origen ROFÉ exacto, página superior `/barista` y recurso exclusivamente VIDEO_CAPTURE. Deniega micrófono, peticiones mixtas, terceros y otras rutas. Revalida antes de conceder un permiso pendiente y lo cancela al navegar/destruir la página.

La cámara se detiene al cerrar el escáner, cambiar de pantalla, ocultar la página o suspender la app; si el permiso termina después del cierre, las pistas también se detienen. Escribir el código sigue disponible si no se concede permiso. Las cabeceras web permiten cámara sólo en `/barista`; el resto conserva la prohibición.

## Compilar y actualizar

JDK 17, Android SDK plataforma 35 y Gradle Wrapper del repositorio. En esta Mac se conservaron bajo `.rofe-local/android-toolchain/`, excluidos de Git:

```sh
export JAVA_HOME="$PWD/.rofe-local/android-toolchain/jdk-17.0.21+9/Contents/Home"
export ANDROID_HOME="$PWD/.rofe-local/android-toolchain/sdk"
cd android-kiosk
./gradlew :barista:testDebugUnitTest :barista:lintDebug :barista:assembleDebug
./gradlew :barista:assembleRelease
```

Configuración independiente `-Pbarista.*` o variables `ROFE_BARISTA_*`: `debugUrl`, `stagingUrl`, `releaseUrl`, `versionCode`, `versionName`, `adminPinHash`, `keystoreFile`, `keystorePassword`, `keyAlias`, `keyPassword`. Release exige HTTPS y ruta `/barista`. El valor por defecto es `https://rofe.vercel.app/barista`; esa web debe estar desplegada antes de usar la release. El backend y la web se actualizan de forma central; cambios del shell requieren actualizar sólo su APK con la misma identidad, firma y versionCode creciente. No desinstales para actualizar: usa `adb install -r` y conserva datos.

`.github/workflows/android-barista.yml` prueba, lint y compila Barista independientemente del workflow Kiosco. Secretos de firma separados: `ROFE_BARISTA_KEYSTORE_BASE64`, `ROFE_BARISTA_KEYSTORE_PASSWORD`, `ROFE_BARISTA_KEY_ALIAS`, `ROFE_BARISTA_KEY_PASSWORD`; PIN inicial opcional `ROFE_BARISTA_ADMIN_PIN_HASH`. Sin keystore el resultado release queda marcado UNSIGNED y no se presenta como instalable. No se creó ni publicó una clave de producción.

El workflow manual también puede ejecutar `scripts/coexistence-smoke.sh` en emulador: compila dos debug de loopback, instala ambas, inicia sus actividades y conserva la lista de paquetes. Para emulador local se requieren varios GB adicionales libres. Las pruebas de navegador usan dos contextos y datos sintéticos; no sustituyen volumen de sonido, cámara, Wi-Fi, suspensión y uso físico de las M10.
