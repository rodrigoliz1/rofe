# Producción: dos M10 independientes

Las dos aplicaciones usan HTTPS contra el mismo sistema central. No requieren esta Mac encendida ni `adb reverse`. USB se usa únicamente para inspeccionar/instalar, y puede retirarse después.

| Aplicación release | Paquete | URL | Código local inicial |
|---|---|---|---|
| ROFÉ Kiosco | `com.rofe.kiosk` | `https://rofe.vercel.app/kiosk` | 13 |
| ROFÉ Barista | `com.rofe.barista` | `https://rofe.vercel.app/barista` | 2 |

Las versiones de CI crecen independientemente: Kiosco usa el contador de su workflow (ya supera 12); Barista usa su contador +2. Las identidades y claves de ambas release son diferentes. `scripts/build-android-production.mjs` compila, exige firma privada válida y conserva APK, comprobantes públicos de firma y SHA-256 en `android-kiosk/dist/production/`, excluido de Git.

## Firma y conservación de datos

En la M10 de barra se inspeccionaron por lectura las dos debug instaladas: Kiosco código 7 (`com.rofe.kiosk.debug`, certificado SHA-256 `ac8d39ebcc271d8c53f1aa725f3a07f903ddeb2a929a1aefbf62e581527813dc`) y Barista código 1 (`com.rofe.barista.debug`, certificado `1d0737d29305f83283f8858d483dcfb8046320a432f768d36901bc51ddd32b5f`). Queda inspeccionar directamente la M10 de clientes; no se supone que ambas tengan los mismos datos por tener la misma versión.

El certificado de Kiosco coincide exactamente con la APK del run 7 de GitHub Actions (`41990272884`), cuyo certificado es Android Debug. El artefacto no contiene el keystore privado; los siguientes runners generaron otros certificados debug. El certificado público no permite recuperar la clave privada ni fabricar una firma compatible. No se encontró la clave original en las ubicaciones disponibles de la Mac.

Por tanto, **no se puede actualizar directamente ese paquete debug con la nueva clave release**. La instalación release usa un paquete distinto y puede coexistir con la debug: conserva intactos los datos anteriores, pero no hereda automáticamente sus cookies, PIN, registro de terminal, carritos u outbox. Los datos centrales de Supabase permanecen compartidos.

La clave debug de esta Mac sí coincide con la Barista debug inspeccionada. Esto permite futuras actualizaciones debug compatibles si se conserva esa clave, pero una build debug no se presenta como release. La nueva Barista release tiene identidad y firma definitivas propias y puede coexistir con esa debug.

No se ejecutan `adb uninstall`, `pm clear`, restablecimientos ni sustituciones de firmas. La retirada de una debug sólo debe decidirse después de verificar que no tiene ventas offline/drafts pendientes, respaldar la información recuperable y confirmar la nueva app en producción, con autorización explícita del dueño.

## Instalar sin borrar las debug existentes

Activa depuración USB temporalmente, conecta la tablet elegida y desde la raíz del proyecto:

```sh
alias adb="$PWD/.rofe-local/android-toolchain/sdk/platform-tools/adb"
adb devices -l
# Sustituye SERIAL por el identificador de la tablet que corresponde.
adb -s SERIAL install -r android-kiosk/dist/production/ROFE-Barista.apk
# En la M10 de clientes, cuando se autorice su incorporación:
adb -s SERIAL install -r android-kiosk/dist/production/ROFE-Kiosco.apk
```

Estos comandos instalan los paquetes release independientes. No actualizan ni borran los paquetes `.debug`. Si Android informa incompatibilidad de firma en un paquete release ya existente, detente: nunca lo resuelvas desinstalando automáticamente.

Abre **ROFÉ Barista** (sin «Debug»), conecta Wi-Fi e inicia sesión con una cuenta BARISTA, MANAGER o ADMIN activa de producción. No reutilices credenciales exclusivas del entorno local. Si el sonido requiere interacción, pulsa «Activar sonido». Habilita cámara únicamente al escanear un cupón.

Abre **ROFÉ** release en la M10 de clientes. El paquete nuevo requiere su propio registro de terminal contra producción mediante el procedimiento administrativo existente. Conserva la debug y su registro mientras se verifica la nueva terminal; no copies tokens a mano, no publiques la clave de enrolamiento y no revoques la terminal anterior durante una venta. Crea el PIN nativo desde el menú antes de exponer la tablet al cliente.

Al actualizar una release posteriormente: mismo paquete, mismo certificado y versionCode superior → `adb install -r` conserva su almacenamiento. No uses `-d` para degradar versiones. Si se utiliza Device Owner, Android admite un solo propietario por dispositivo; la transición desde otro paquete requiere un procedimiento aparte. No actives/desactives ese propietario por prueba.

## Custodia de claves

Claves y configuración privada: `~/Library/Application Support/ROFE/AndroidSigning/`, directorio 0700 y archivos 0600. Keystores PKCS12 RSA 3072 separados y persistentes. Configuración de firma local en `signing.json`; sus contraseñas no se imprimen ni se versionan.

Certificados release SHA-256:

- Kiosco: `6a5638ecf147a8c21eeaa56d2d54b9ffa65d52cfce75cb82884bee47e1ebd2dc`.
- Barista: `b17aa367f2445ac36ebeae77ae8464d9830156b6e1faa3a38ec9dc34f0f0c9f9`.

Respaldo cifrado AES-256/PBKDF2: `~/Documents/ROFE-Signing-Backups/`; la recuperación se conserva separadamente en `~/Library/Application Support/ROFE/SigningRecovery/`. Se comprobó descifrado y hashes sin revelar contenido privado. Es un respaldo en la misma Mac: el dueño debe custodiar una copia del archivo cifrado y la recuperación en ubicaciones independientes (por ejemplo, almacenamiento externo y gestor de contraseñas). No publicar ambos juntos ni perderlos.

GitHub Actions tiene los ocho secretos `ROFE_KEYSTORE_*`/`ROFE_KEY_*` y `ROFE_BARISTA_KEYSTORE_*`/`ROFE_BARISTA_KEY_*`, mediante su almacén cifrado; no son archivos del repositorio. Los workflows restauran la clave sólo en el directorio temporal del runner. Para nuevos equipos se recupera la misma clave, sin generar otra que rompa actualizaciones.

## Prueba física controlada pendiente

Sin operaciones financieras automáticas:

1. Inspeccionar versión/firma en la M10 de clientes y comprobar su registro, caché y outbox antes de cambios.
2. Abrir ambas aplicaciones por Wi-Fi y sin túnel USB; el personal ingresa sus credenciales directamente.
3. Administrador revisa cantidades/costos de recetas y confirma existencias físicas. Azúcar permanece deshabilitada hasta resolver las 500 unidades registradas; no se reinterpretan como gramos.
4. El dueño autoriza producto, importe y operación de prueba. Sólo entonces crea el pedido real desde Kiosco; comprueba una alerta en Barista, instrucciones y cotización.
5. El personal cobra y prepara/entrega; verifica una sola afectación de inventario y ledger, y el corte según el procedimiento de caja real.
6. Probar una desconexión/reconexión sin reenviar el cobro; cámara, suspensión, sonido y actualización se verifican físicamente.

Ninguna prueba automática crea cargos, cancelaciones financieras o movimientos de caja en producción. Las pruebas locales/PostgreSQL usan datos aislados.
