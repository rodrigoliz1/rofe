# Ejecución y entrega local — ROFÉ, 5 de noviembre de 2026

Rama: `codex/rofe-development`. Trabajo dividido en commits de caja, fotografías, personalizaciones y aplicación Barista. No se incluyeron `.env`, credenciales, bases locales, logs privados ni APK en Git. No se hicieron cambios de producción, migraciones remotas, push ni merge durante esta ejecución.

## Caja

Sobre una copia exacta de los datos locales existentes se verificó cierre de sesión anterior, apertura nueva (201), repetición de apertura (200, mismo ID), movimiento de efectivo sin duplicación al repetir y cierre con diferencia cero. El archivo original se conservó intacto durante ese recorrido. El estado encontrado era una sesión ya abierta, que ahora se informa adecuadamente; se añadió idempotencia de apertura y recuperación de la vista ante conflictos. El request ID histórico no aparece en los logs disponibles: no se afirma una causa exacta de aquel 500 sin evidencia. [Diagnóstico y pruebas](CASH_SESSION_FIX.md).

## Fotografías

Se generaron realmente **12 originales nuevos** y se revisó su colección visual. Cada producto tiene su toma diferenciada, fondo crema y luz uniforme, manifiesto `approved`, versiones WebP de 384/640/960 px, nombres con hash, integración en POS/kiosco/QR/modal y precarga del kiosco. Los archivos antiguos versionados se conservaron para no romper clientes con caché previo. [Inventario antes/después, procedencia y cobertura](PHOTO_COLLECTION_DELIVERY.md).

## Personalizaciones

Administración define grupos, recetas, cantidades, unidades, equivalencias, límites, recargos e instrucciones; el servidor resuelve y valida la receta/precio en la cotización y vuelve a validar al crear/cobrar. Se guarda la receta/costo resueltos con el pedido y se conserva el consumo único del flujo financiero existente.

El dueño delegó las cantidades iniciales: azúcar **Poco 2 g / Normal 4 g / Mucho 8 g**, Splenda **0–2 sobres**, sin recargo inicial; configuración editable. Tamaños, leches, hielo, temperatura y shots sólo se ofrecen cuando la receta tiene sentido y permite calcular cantidades. Las recetas locales se configuraron con backup, conservando pedidos, sesiones de caja e historial financiero; la comparación del backup confirma que sólo cambiaron `products` y `rawInventory`. Azúcar/Splenda tienen stock y costo cero hasta registrar compras/existencias reales. No se cambió el catálogo remoto. [Contrato completo y evidencia](PERSONALIZATION.md).

## Barista

Aplicación Android independiente y ruta protegida `/barista`; código de negocio compartido con ROFÉ. Cola táctil, sonido sin duplicados, SSE/reconexión, canal de origen, efectivo, cupones, instrucciones precisas y cámara limitada al escaneo. [Entrega técnica](BARISTA_DELIVERY.md) y [instalación](../android-kiosk/BARISTA.md).

APK locales en `android-kiosk/dist/`: `ROFE-Barista.apk`, `ROFE-Kiosco.apk` y `ROFE-Barista-release-UNSIGNED.apk`. Las debug están firmadas y usan el backend local por túnel USB; la release necesita el keystore privado y un despliegue de la web actualizada. Checksums en `SHA256SUMS`.

## Validación

| Comprobación | Resultado |
|---|---|
| Lint frontend/backend y typecheck | Correctos, sin advertencias después de limpiar las directivas del adaptador |
| Unitarias frontend | 32 aprobadas |
| Unitarias backend | 65 aprobadas |
| E2E | 78 aprobadas, incluyendo M10 horizontal/vertical, Barista, cámara sintética y personalización completa |
| Builds web/backend/PWA | Correctos, PWA validada |
| PostgreSQL temporal | Migraciones 001–008, flujos transaccionales y concurrencia correctos |
| Android Kiosco | 22 pruebas aprobadas, lint y debug correctos |
| Android Barista | 17 pruebas aprobadas, lint, debug y release sin firmar correctos |
| Identidad/permisos APK | `aapt`: paquetes diferentes; CAMERA sólo en Barista, sin micrófono |
| Firma debug | Verificada con `apksigner` |
| `npm audit` | Frontend: 10 moderadas de herramientas ESLint/minimatch; 0 altas/críticas; producción y backend: 0 |
| API local | `/ready` correcto; páginas Barista y Kiosco HTTP 200 |

La primera ejecución general detectó contaminación entre pruebas por dos pedidos sintéticos sin cancelar; se corrigió su limpieza y la ejecución completa pasó 78/78. La primera descarga de emulador agotó espacio; se retiraron únicamente descargas/cachés propios. No se ocultan estos fallos como resultados satisfactorios.

## Uso local

Con `npm run dev`:

- POS: `http://127.0.0.1:5173/`
- Kiosco: `http://127.0.0.1:5173/kiosk`
- Barista: `http://127.0.0.1:5173/barista`
- Menú QR: `http://127.0.0.1:5173/pedir`
- Administración: desde el acceso de equipo del POS, con una cuenta autorizada.
- Backend: `http://127.0.0.1:3000/ready`

El perfil local impide usar Supabase, Point o Stripe remotos; sus pagos son simulados. No se restablecieron contraseñas existentes. Logs y evidencias técnicas privadas en `.rofe-local/evidence/`; imágenes de demostración versionadas en `docs/evidence/`.

## Pendientes de operación y publicación

Validación física de ambas M10 (cámara, volumen, Wi-Fi, suspensión, arranque/Device Owner y actualización), firma release privada, revisión administrativa de equivalencias/costos y existencias reales, prueba financiera autorizada de Point/Stripe/cupones/corte, política fiscal y de vigencia de cupones, rate limiting global y mantenimiento del tooling vulnerable. La migración 008 ya está aplicada y no debe repetirse.

La autorización final del dueño para push/merge/despliegue está condicionada a concluir correctamente. Las verificaciones locales no prueban por sí solas el equipo físico ni pagos reales, y no se presenta el proyecto como «perfecto» o aprobado para cobrar en producción.
