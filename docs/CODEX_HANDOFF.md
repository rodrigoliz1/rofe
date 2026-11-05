# ROFÉ — Traspaso de desarrollo (Claude Code → Codex local)

Fecha: 5 de noviembre de 2026. Este documento basta para continuar sin el historial de la sesión anterior. Las respuestas al dueño van **en español**.

Continuación en la Mac: el diagnóstico y la configuración aislada se conservan en la rama local **`codex/rofe-development`**, basada en el estado de la rama Claude descrito abajo. Consulta [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) para arrancar y [CATALOG_REPLACEMENT_PLAN.md](CATALOG_REPLACEMENT_PLAN.md) para el orden de correcciones y la sustitución fotográfica. Sin push ni cambios a producción.

## 1. Estado del repositorio

| Elemento | Estado |
|---|---|
| Rama de trabajo | `claude/kiosk-production-hardening` |
| PR #2 (kiosco, APK, fotos, efectivo, cupones, auditoría) | **Ya fusionado en `main`** el 5-nov (merge `2650b80`; cabeza del PR `e4b95f6`), a petición del dueño tras la auditoría |
| Commits en la rama posteriores al merge | Solo documentación (este archivo, README, PRODUCTION_READINESS). **No están en `main`**: requieren un PR nuevo cuando el dueño lo autorice |
| `main` | Lo despliega Vercel en producción (`rofe.vercel.app`) |
| PR #1 (Render → Vercel) | Fusionado por squash (`9454620`). La rama `claude/practical-archimedes-3ibbur` contiene sus commits originales; no hay trabajo perdido |
| `claude/android-kiosk-m10` | Sin commits fuera de `main` |
| Migraciones aplicadas en Supabase | **001–008 aplicadas**. Confirmado por el dueño y por consulta GET de solo lectura a `rofe_schema_version()` (8) el 5-nov-2026 |

Para continuar en la Mac:

```bash
git fetch origin
git checkout claude/kiosk-production-hardening
git pull origin claude/kiosk-production-hardening
npm ci && npm --prefix backend ci
# Sigue docs/LOCAL_DEVELOPMENT.md para crear el perfil aislado.
# No sobrescribas backend/.env: puede contener credenciales reales.
npm run dev
```

`npm run dev` fuerza el adaptador JSON aislado en `.rofe-local/db.json`, pagos simulados y servicios remotos deshabilitados. Conserva `backend/.env` y `backend/db.json` (este último está versionado como semilla). Consulta [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) y [LOCAL_AUDIT_2026-11-05.md](LOCAL_AUDIT_2026-11-05.md).

## 2. Arquitectura

- **Frontend** (`src/`): React 19, TypeScript y Vite. Es una PWA con service worker (`public/sw.js`) y una cola offline en IndexedDB. Superficies:
  - POS/barista (`BaristaView`): pedidos, cobro en efectivo y pestaña «Cupones».
  - KDS.
  - Admin (`AdminView`), con Finanzas → «Cupones de cambio».
  - Pickup QR/Stripe.
  - Terminal de autoservicio `/kiosk` (`src/kiosk/`).
- **Backend** (`backend/src/`): Express con validación Zod, RBAC (`ADMIN`, `MANAGER`, `BARISTA`, `POS_DEVICE`), JWT de 15 min y refresh en cookie httpOnly.
  - `index.ts` concentra casi todas las rutas.
  - `db.ts` define la interfaz `DbAdapter` y su implementación JSON (desarrollo y E2E; serializa todas las operaciones).
  - `supabaseAdapter.ts` es el adaptador de producción: llama a funciones plpgsql atómicas (`FOR UPDATE`).
- **Despliegue**: Vercel sirve el frontend y la API juntos. `api/index.js` exporta Express como Function; `vercel.json` define rewrites, caché y build. No hay cron: la conciliación se hace con webhooks, polling del cliente y el barrido del SSE. El tiempo real usa SSE con polling a `orders.updated_at` (migración 006).
- **Base de datos**: Supabase/PostgreSQL. `backend/migrations/001…008` son migraciones versionadas y no destructivas. El backend exige `rofe_schema_version() >= 5`; los cupones necesitan 7 para emitirse y 8 para usarse en pedidos.
- **Pagos**:
  - Mercado Pago Point (`backend/src/payments/`): orden idempotente; webhook y consulta comparten la misma conciliación.
  - Stripe para pedidos QR/pickup.
  - Efectivo, contado por denominaciones.
- **APK Android** (`android-kiosk/`): contenedor Kotlin con WebView sobre `https://<dominio>/kiosk`. Inmersivo, con Lock Task y Device Owner, autoarranque y salida admin por PIN (PBKDF2). No contiene lógica de negocio. Se compila en GitHub Actions (`.github/workflows/android-kiosk.yml`) en variantes debug, staging y release; release solo sale firmado si existen los secretos `ROFE_KEYSTORE_*`. Documentación: `android-kiosk/README.md` y `docs/KIOSK.md`.

## 3. Módulos recientes y decisiones

### Terminal kiosco (`src/kiosk/`)
- `KioskTerminal` muestra el catálogo a pantalla completa. El carrito abre en `KioskCartDrawer` desde el botón «TU PEDIDO» del encabezado: un drawer en horizontal y una hoja inferior en vertical. `useStackedLayout` sigue la orientación física, así que el teclado virtual no cambia el layout.
- También incluye:
  - Inactividad «¿Sigues ahí?» (`useIdleTimer`).
  - Pantalla de reconexión (`useReachability`).
  - Pila de Atrás (`backStack`).
  - Pulsación larga en el logo para el acceso del personal.
  - Puente nativo (`nativeBridge`).
- Sonidos: `src/assets/audio/exito.mp3` (el archivo del dueño) y `fallido.mp3`.
- Capturas de referencia en `docs/kiosk-screens/`.

### Fotos del catálogo
- El manifiesto `src/kiosk/productImages.json` (versión 2) cubre 12 productos con estado `approved`, `interim` o `pending`. Las imágenes son WebP con hash de contenido en `public/products/`, con caché inmutable (`vercel.json`) y caché SW `rofe-photos-v1`, y se precargan con concurrencia 3 (`src/services/imagePreload.ts`).
- **Precedencia** (`src/services/productImages.ts`): `approved` > subida del admin posterior a `approvedAt` > `interim` > `pending` (ilustración de marca). Así se corrigió el 404 de `/espresso.png` y las URLs de Unsplash viejas de la base de producción.
- **No hay colección nueva generada**: el entorno no tenía generación de imágenes. Estado actual:
  - `interim` (fotos existentes reprocesadas): espresso, americano, matcha-latte, cold-brew, iced-latte, iced-matcha-latte, pain-au-chocolat, galleta-chocolate.
  - `pending`: double-espresso, latte, flat-white, croissant-mantequilla.
- Los prompts y el importador están en `scripts/product-images/` (`build.py`, `import.py`, `sources.json`) y en `docs/CATALOG_PHOTOS.md`.

### Cobro en efectivo y cupones de cambio
Documentación completa: `docs/CHANGE_VOUCHERS.md`.

- **Cobro**: `CashPaymentPanel` tiene mosaicos de billetes y monedas (+1 por toque, botón «−» al lado), con el resumen y Cobrar/Cerrar arriba.
- **Cambio insuficiente**: si la caja no alcanza para el cambio, se puede cancelar la venta o emitir un cupón de cambio.
- **Formato del cupón**: código Crockford base32 `XXXX-XXXX-XX`; el QR contiene `ROFE-VALE:<código>`.
- **Uso**: el cupón sirve en el checkout (incluido el kiosco) o el barista lo paga en efectivo desde `VoucherPanel`, escaneando con cámara (jsQR) o escribiendo el código.
- **Decisión contable**: el cupón es un **pasivo** (dinero que ROFÉ debe al cliente), no un descuento.
  - El pedido conserva su `total`; `orders.voucher_amount` guarda la parte pagada con cupón, y `amountDue = total − voucher_amount` es lo que se cobra por Point o en efectivo y lo que se devuelve.
  - Los reportes muestran `voucherSettled`.
  - `expectedCash` del corte es solo efectivo físico, y el resumen `vouchers` va aparte.
- **Controles del servidor**:
  - Valida recibido − cambio − cupón = por cobrar, en centavos exactos.
  - Solo emite cupón si `bestPossibleChange` (`backend/src/domain/cash.ts`) demuestra que el cambio no se puede dar.
  - Cada operación lleva `operation_id` idempotente.
  - El pago del cupón en efectivo exige el saldo exacto.
  - Una reserva cuyo pedido nunca se guardó se libera a los 10 minutos.
  - La sincronización offline rechaza cupones.
  - La cancelación administrativa exige motivo, queda auditada, no se permite con reservas en pedidos pendientes y nunca se revierte con una liberación posterior.
- **Funciones SQL**:
  - 007: `confirm_cash_payment_with_voucher`, `redeem_change_voucher_cash`, `apply_change_voucher_to_order`, `release_change_voucher_for_order`.
  - 008: `cancel_change_voucher`, `release_orphan_change_voucher_redemptions`, una nueva versión de `release_change_voucher_for_order`, y `apply_order_refund` corregida (registra en caja el efectivo realmente devuelto, $0 con tarjeta).
- **Rutas**:
  - `GET /api/vouchers/:code`
  - `POST /api/vouchers/:code/redeem-cash`
  - `POST /api/orders/:id/cash-payment` (con `voucher`)
  - `POST /api/orders/:id/cancel-insufficient-change`
  - `GET /api/admin/vouchers?status=`
  - `POST /api/admin/vouchers/:code/cancel`

## 4. Pruebas y cómo correrlas

| Comando | Qué cubre |
|---|---|
| `npm run verify` | Lint, tipos, Vitest frontend y backend, y build de ambos |
| `npm --prefix backend run lint` | ESLint del backend (2 advertencias `any` previas, 0 errores) |
| `npm run test:e2e` | 75 recorridos Playwright con 3 proyectos: iPad horizontal, M10 horizontal y M10 vertical (`e2e/kiosk-terminal.spec.ts`). Usa una base JSON temporal |
| `npm --prefix backend run test:db` | PostgreSQL temporal: aplica 001–008, `tests/sql/critical-flows.sql` y `tests/sql/concurrency.sh` (carreras reales con psql en paralelo). Necesita `initdb`, `pg_ctl` y `psql` (en Mac: `brew install postgresql@16`) |
| `npm --prefix backend run check:production` | Solo lecturas contra producción; falla a propósito si no hay credenciales reales |
| Android | Solo en GitHub Actions o en una Mac con Android Studio: `cd android-kiosk && ./gradlew :app:testDebugUnitTest :app:assembleDebug` |

Pruebas clave de cupones: `backend/tests/vouchers.test.ts`, `e2e/cash-vouchers.spec.ts`, `e2e/voucher-audit.spec.ts` y `src/utils/voucher.test.ts` (decodificación del QR).

### Resultado de la última verificación (5-nov-2026, código de `e4b95f6`)

| Verificación | Resultado |
|---|---|
| `npm run verify` (lint, tipos, 29 pruebas frontend, 55 backend, builds) | ✅ Pasa |
| Lint del backend | ✅ 0 errores (2 advertencias) |
| PostgreSQL 001–008, flujos críticos y concurrencia | ✅ Pasa |
| Playwright | ✅ 75 de 75 |
| `npm audit --omit=dev` frontend y backend | ✅ 0 vulnerabilidades |
| CI de GitHub en PR #2 (verify ×2 y build Android) | ✅ Pasa (la instrumentada en emulador se omite) |
| `check:production` | ❌ Falla, como se espera: el contenedor no tiene credenciales de producción |

## 5. Reglas del dueño (siguen vigentes)

- No hacer merge a `main` ni desplegar a producción sin autorización explícita.
- No alterar datos reales de producción en pruebas ni ejecutar pagos reales sin autorización.
- No aplicar migraciones destructivas, y no aplicar migraciones remotas por cuenta propia: el dueño las aplica en Supabase.
- No poner secretos en el frontend, en GitHub ni en la APK. No generar ni inventar credenciales.
- No afirmar que algo está listo para producción, ni probado físicamente, si solo se usaron emuladores o si quedan pruebas pendientes.
- No afirmar que hay imágenes generadas si no hubo generación real.

## 6. Riesgos conocidos (estado histórico previo a la ejecución de desarrollo)

1. **Migración 008 aplicada**: pendiente resuelto. La función remota de versión devuelve 8; aún falta validar los recorridos reales de cupones y reembolsos con autorización.
2. Los cupones no caducan y su tratamiento fiscal no está definido; lo debe decidir el contador.
3. Un pedido pendiente abandonado que reservó un cupón lo bloquea hasta que un gerente cancela el pedido.
4. El cobro parcial con Point (total menos cupón) no se ha probado contra Mercado Pago real.
5. El escaneo con cámara solo se probó con la decodificación automática, no en un iPad ni en la M10 física. La APK kiosco no concede cámara, así que el panel de cupones es para el navegador de caja.
6. El rate limiting es por instancia de Vercel, no global.
7. La APK release sale sin firmar mientras no existan los secretos de keystore. Nada se ha probado en una M10 física; solo emuladores y Playwright.
8. Las fotos `interim` y `pending` siguen esperando la colección definitiva.

## 7. Tareas pendientes históricas, en orden sugerido

1. Abrir un PR con los commits de documentación que siguen en esta rama, cuando el dueño lo pida.
2. **Resuelto:** el dueño aplicó `backend/migrations/008_voucher_ledger.sql`; versión remota 8 comprobada por lectura. La validación operativa de producción (`/ready`, consulta autenticada e importes reales) sigue pendiente; no aplicar otra vez la migración.
3. Prueba controlada en el local: cobro en efectivo con cupón, uso del cupón en otro pedido, pago en efectivo de un cupón y corte de caja con diferencia 0.
4. Configurar los secretos `ROFE_KEYSTORE_BASE64`, `ROFE_KEYSTORE_PASSWORD`, `ROFE_KEY_ALIAS`, `ROFE_KEY_PASSWORD` y, opcionalmente, `ROFE_ADMIN_PIN_HASH`, e instalar la APK release en la M10 como Device Owner (`android-kiosk/README.md`).
5. Producir la colección de fotos definitiva y llevarla a `approved` con `scripts/product-images/import.py`.
6. Definir la política de vigencia de los cupones y, si aplica, implementar la expiración como movimiento auditado, sin borrar nada.
7. Opcional:
   - Liberar automáticamente las reservas de pedidos pendientes abandonados después de N minutos.
   - Rate limiting global (por ejemplo, en Supabase).
   - Una prueba E2E con cámara simulada.
   - Corregir las 2 advertencias `any` del lint del backend.

## 8. Ejecución de desarrollo local — actualización del 5 de noviembre

Rama `codex/rofe-development`. Caja: apertura idempotente y flujo sobre copia exacta verificados; el request ID histórico no está disponible y su 500 no se atribuye sin evidencia. Ver [CASH_SESSION_FIX.md](CASH_SESSION_FIX.md).

Las doce fotos definitivas se generaron realmente, revisaron e importaron: manifiesto completo `approved`, variantes WebP y precarga comprobada. Ver [PHOTO_COLLECTION_DELIVERY.md](PHOTO_COLLECTION_DELIVERY.md). El punto de fotografías pendientes anterior queda resuelto.

Recetas y personalizaciones administrativas integradas a cotización, unidades, precio, preparación e inventario. El dueño delegó cantidades iniciales: azúcar 2/4/8 g y Splenda 0–2 sobres sin recargo, editables. Se aplicaron sólo al catálogo local con backup; azúcar/Splenda conservan stock cero hasta registrar existencias reales. No se cambiaron datos remotos. Ver [PERSONALIZATION.md](PERSONALIZATION.md).

La segunda app comparte código con Kiosco, entra por `/barista` con autenticación de personal y conserva permisos de cámara exclusivos para escaneo. Identidad, firma, icono y workflow separados; guía [Android Barista](../android-kiosk/BARISTA.md). No se debe confundir una APK compilada o una prueba de navegador con validación física en M10.

Migración 008 sigue aplicada, sin ejecutarla de nuevo. Permanecen pruebas financieras reales autorizadas, firma release, comprobación física de las tablets, política fiscal de cupones y 10 alertas moderadas de tooling ESLint/minimatch (producción npm sin alertas). El dueño autorizó push/merge/despliegue condicionado a concluir correctamente; no presentar estos pendientes como «perfecto».

## Incidente de caja de producción — 5-nov-2026, 14:55 (CDMX)

Soporte `d25e4980-a770-4768-88cc-79465d24d8d9`: **apertura**, RPC
`open_cash_session`, SQLSTATE 21000 por UPDATE sin WHERE rechazado por
pg-safeupdate. El cierre tenía el mismo defecto. Ver diagnóstico y aplicación
segura en [CASH_PRODUCTION_INCIDENT_2026-11-05.md](CASH_PRODUCTION_INCIDENT_2026-11-05.md).

009 reemplaza ambas funciones sin tocar registros financieros; **aplicada por el
dueño y confirmada por RPC de solo lectura: versión 9, 5-nov-2026 21:18 UTC**. No volver a ejecutar 008 ni modificar saldos como
solución. La regresión PostgreSQL ahora cubre el guard real, reversión ante fallo
del informe y carreras de apertura/cierre. La base productiva no tenía sesiones ni movimientos de sesión; los seis conjuntos
financieros se compararon antes/después y permanecen idénticos. Conserva registros legacy.
