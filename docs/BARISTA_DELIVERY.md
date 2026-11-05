# Entrega local de ROFÉ Barista — 5 de noviembre de 2026

## Implementación

- Entrada exclusiva `/barista`, autenticación de personal y validación backend de ADMIN/MANAGER/BARISTA. Sin POS, «Equipo» ni registro de terminal al entrar.
- Cola táctil de tres columnas para M10 horizontal, personalizaciones e ingredientes precisos, efectivo por denominaciones, cupones e historial permitido. Se reutiliza `BaristaView`, sin otra lógica de negocio.
- SSE con reconexión, recuperación de cola y sondeo de respaldo; alerta sonora con registro persistente por UUID para no duplicar al cobrar/reconectar. Origen Kiosco/POS/QR visible.
- Segundo módulo Android `:barista`, paquete `com.rofe.barista`, debug `.debug`, icono propio y configuración/versionado/firma independientes; comparte fuentes del shell con `:app`.
- Pantalla encendida, inmersión, acceso nativo por PIN, inicio automático opcional apagado por defecto, cámara exclusiva para escáner con comprobación de origen/ruta/recurso y permiso runtime. Sin micrófono ni almacenamiento.
- Workflow separado de GitHub Actions para tests, lint, debug, release firmable y smoke de instalación conjunta en emulador manual.

La columna JSONB existente `orders.pickup` conserva metadatos de canal para POS (`{entrypoint: KIOSK|POS}`); el adaptador sólo expone el objeto `pickup` de negocio para QR. No se añadió ni aplicó una migración. `entrypoint` identifica la interfaz y no concede permisos; pedidos históricos sin marca se muestran POS.

## Archivos locales

`android-kiosk/dist/ROFE-Barista.apk` y `ROFE-Kiosco.apk`: APK debug firmadas con certificado de desarrollo, ambas dirigidas al entorno local de esta Mac mediante `adb reverse`. Release de Barista: `ROFE-Barista-release-UNSIGNED.apk`, preparada para la firma privada de la cafetería. No se publicaron APK ni claves.

[Guía de instalación, pruebas y actualizaciones](../android-kiosk/BARISTA.md). SHA-256 en `android-kiosk/dist/SHA256SUMS`. Los binarios se conservan localmente y no se incluyen en commits de código.

## Evidencia

- 22 pruebas Android Kiosco y 17 Barista (incluidas tres Robolectric específicas de la nueva actividad y política de cámara), cero fallos. Lint de ambos módulos y compilaciones debug/release correctos.
- Prueba E2E de dos sesiones: pedidos concurrentes, reintentos de creación, una alerta por UUID, cobro por UI, aceptar/listo/entregar, pérdida de red, pedido recibido durante desconexión, recuperación, recarga de sesión y ledger de alertas persistido.
- Prueba de cámara del navegador con dispositivo sintético: sólo se abre a petición y todas las pistas terminan al suspender el escáner. No prueba un sensor físico.
- Prueba integrada de personalización del kiosco a Barista: cantidades, precio y receta persistidos; cobro repetido sin doble consumo; preparación y entrega; stock y movimiento único por insumo.
- Capturas: [autenticación](evidence/barista-login.png), [cola tablet](evidence/barista-tablet-queue.png), [receta en barra](evidence/personalization-barista.png). Contienen exclusivamente datos sintéticos.

## Límites de esta entrega

No hay una M10 conectada a `adb`. Quedan por validar físicamente cámara QR, volumen, suspensión, Wi-Fi, arranque automático/Device Owner y actualización conservando sesión/datos. La identidad de ambos APK está comprobada con `aapt`, pero esto por sí solo no demuestra la instalación conjunta en un dispositivo. La descarga inicial de un emulador se interrumpió por falta de espacio; se retiraron sólo las descargas temporales propias. La release requiere un keystore real custodiado por el dueño; no se inventó una firma de producción.

El dueño autorizó publicación al concluir correctamente todo. No se presenta esta revisión local como una certificación de operación financiera o física en producción. No se cambiaron datos ni credenciales remotas.
