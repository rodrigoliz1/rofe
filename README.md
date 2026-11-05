# ROFÉ Espresso Bar 1.0

Sistema POS y administrativo para la operación diaria de una cafetería móvil. Reúne toma de pedidos, cobro con efectivo o Mercado Pago Point, KDS para baristas, caja, catálogo, recetas, insumos, costos y cierres.

## Arquitectura

- `src/`: React 19, TypeScript y Vite. El POS usa una terminal autorizada; admin y KDS usan cuentas backend.
- `src/hooks/`: lógica de checkout recuperable, sincronización, acciones asíncronas y foco de diálogos.
- `src/styles/`: estilos divididos por superficie y tokens compartidos.
- `src/services/`: cliente API con refresh seguro, stream SSE con reconexión e IndexedDB para la outbox offline.
- `backend/src/routes/`: rutas de catálogo y contrato compartido de rutas.
- `backend/src/payments/`: envío idempotente a Point, validación y conciliación común para webhook y consulta.
- `backend/src/`: Express, validación Zod, RBAC, sesiones, cálculo de precios, caja, inventario y Mercado Pago.
- `backend/migrations/`: migraciones PostgreSQL/Supabase versionadas y no destructivas.
- `e2e/`: recorridos Playwright sobre servidores reales y una base JSON temporal aislada.

En producción no existe fallback silencioso: configuración o base inválida detienen el arranque.

## Seguridad y permisos

Roles: `ADMIN`, `MANAGER`, `BARISTA` y `POS_DEVICE`.

- Los secretos y contraseñas no viven en el frontend.
- El access token dura 15 minutos; el refresh token rota y viaja en cookie `httpOnly`.
- Cada iPad se registra una vez con `DEVICE_ENROLLMENT_SECRET`; su token se guarda en IndexedDB y puede revocarse en base de datos.
- Admin, catálogo mutable, caja, inventario, cierre, KDS y SSE están protegidos por rol.
- El backend recalcula todos los precios. El cliente sólo envía producto, cantidad y modificadores.
- Body limitado, CORS explícito, Helmet, rate limiting, request IDs, errores tipados y logs JSON.
- Los pagos y consumos de receta se confirman una sola vez mediante `confirm_order_payment`.
- Los pedidos y movimientos no se borran; las correcciones quedan auditadas.
- Los descuentos requieren credenciales de `ADMIN`/`MANAGER`, expiran en cinco minutos y quedan ligados a un único `operationId`.

## Requisitos

- Node.js 22.12 o superior.
- npm 10 o superior.
- Supabase (PostgreSQL administrado) para producción; el adaptador local JSON es exclusivamente de desarrollo/pruebas.
- Aplicación y terminal Point configuradas en Mercado Pago.

## Desarrollo local

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env
npm ci
npm --prefix backend ci
```

Genera secretos independientes y hashes de contraseña:

```bash
openssl rand -base64 48
node backend/scripts/hash-password.cjs "una-contraseña-segura"
```

Completa `backend/.env` y arranca ambos procesos:

```bash
npm run dev
```

La primera visita muestra “Autoriza esta terminal”. Usa el mismo valor configurado en `DEVICE_ENROLLMENT_SECRET` y asigna un nombre reconocible, por ejemplo `iPad barra`.

## Base de datos y migraciones

1. Crea un backup antes de migrar.
2. Ejecuta, en orden, los archivos de `backend/migrations/` con un rol de migración.
3. Configura `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` sólo en el backend.
4. Verifica `GET /ready` antes de enviar tráfico.

Aplica **001 a 008**, en orden. El arranque verifica la versión del esquema (mínimo 5) y no modifica la base automáticamente. Las migraciones añaden protección frente a eventos tardíos, reservas de insumos, compras en efectivo transaccionales, el canal público de pickup (005), `updated_at` para el tiempo real en Vercel (006), cupones de cambio (007, versión 7) y el libro de cupones como pasivo (008, versión 8). Sin 007 los cupones responden «falta la migración». Sin 008, usar un cupón en un pedido responde 503. Detalles en [docs/CHANGE_VOUCHERS.md](docs/CHANGE_VOUCHERS.md).

`001_rofe_1_0.sql` conserva pedidos existentes, añade sesiones, dispositivos, auditoría, compras, proveedores, movimientos de inventario, caja, producción y cierres; también instala funciones transaccionales e idempotentes para pagos, caja, compras, ajustes, producción, devoluciones y cierre.

## Pedidos por QR y Stripe

`/pedir?stand=entrada-01` abre el menú público para celulares, sin autorizar dispositivos ni crear cuentas. El cliente personaliza, revisa su carrito, paga en Stripe Checkout y conserva un folio con el estado del pickup. Los pagos confirmados llegan al KDS y al mismo ledger de ventas e inventario del POS.

Administración → **Pedidos QR** permite pausar nuevos pedidos, configurar el lugar de recogida, verificar la cuenta Stripe y descargar QR/letreros SVG para cada stand. El QR usa la dirección pública configurada en `PUBLIC_ORDERING_URL`; sin ella sólo se genera una vista previa local.

Configura `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y el origen público. No se necesita una clave publicable porque el cobro usa la página alojada de Stripe. La activación, eventos y prueba real están en [docs/QR_PICKUP.md](docs/QR_PICKUP.md).

## Mercado Pago Point

ROFÉ usa Orders API:

1. El POS envía una selección de productos.
2. El backend recalcula el total y crea `POST /v1/orders` con `X-Idempotency-Key`.
3. Point cobra en la terminal configurada.
4. El webhook `orders` llega a `/api/webhooks/mercadopago`.
5. ROFÉ valida `x-signature`, `x-request-id` y `data.id`.
6. El backend consulta `GET /v1/orders/{id}` y compara estado, referencia e importe.
7. Pago, ledger e inventario se confirman una vez.

El pedido se guarda antes de contactar Point. Los reintentos mantienen referencia, importe e idempotency key; no se genera otro cobro al recargar. La consulta del estado recupera confirmaciones aunque se haya perdido SSE. Una cancelación HTTP 202 permanece pendiente hasta su confirmación. Los insumos reservados no pueden consumirse con una merma, producción o ajuste concurrente.

En administración, **Terminal Point → Verificar conexión** consulta la cuenta real y valida la vinculación y el modo de operación. No realiza cargos ni prueba que la terminal física tenga internet.

Configura el tópico **Order (Mercado Pago)**; no uses el tópico legado `point_integration_wh`. `ENABLE_PAYMENT_SIMULATION=true` sólo funciona fuera de producción y debe permanecer `false` en despliegues reales.

## Offline y PWA

La instalación de terminal abre `/kiosk` en modo `standalone`, orientación horizontal y scope raíz. Chrome Android requiere un origen seguro; una IP LAN mediante HTTP no valida instalación. Los iconos se generan desde el SVG de marca en cada build y se comprueban automáticamente, incluidos los maskable opacos.

`npm run validate:pwa` valida el build. `npm run audit:pwa -- --url https://tu-dominio/kiosk` comprueba respuestas, redirects, manifest e iconos, registro/control del worker y arranque offline en Chromium con Android emulado. Para probar exclusivamente el build local usa `--local --url http://127.0.0.1:4173/kiosk`; esa excepción de loopback no se aplica al teléfono conectado por LAN.

Diagnóstico del fallo y pasos para la M10: [PWA_ANDROID_AUDIT.md](docs/PWA_ANDROID_AUDIT.md).

- El build genera una PWA que precarga JS, CSS, fuentes y fotografías; las actualizaciones esperan a que se cierren las pestañas existentes.
- El menú se conserva en IndexedDB y puede volver a abrirse sin red.
- El shell PWA se guarda en caché; las respuestas `/api` nunca se cachean.
- La UI distingue en línea, reconectando, sin internet y operaciones por sincronizar.
- Las órdenes en efectivo pueden entrar a la outbox IndexedDB con un `operationId` UUID.
- Al reconectar, el servidor vuelve a validar y cotizar cada operación; un retry no duplica la venta.
- Una tarjeta jamás se considera pagada offline ni por afirmación del navegador.

## Comandos de calidad

```bash
npm run verify
npm run test:e2e
npm --prefix backend run test:db
npm --prefix backend run check:production

npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build
```

Las pruebas PostgreSQL requieren `initdb`, `pg_ctl`, `createdb` y `psql`; crean y eliminan un clúster temporal propio y nunca usan `DATABASE_URL`. `check:production` sólo hace lecturas: verifica configuración, esquema y terminal vinculada.

Playwright ejecuta los builds compilados, usa un frontend aislado en `.rofe-e2e-dist` y una base temporal en `/tmp/rofe-e2e-db.json` y credenciales exclusivas de test. No toca `backend/db.json`.

## Despliegue

### Vercel (frontend + API en un solo proyecto)

La PWA y la API Express se publican juntas en Vercel; no hay servidor aparte. `vercel.json` define todo:

- Instalación: `npm ci && npm --prefix backend ci`.
- Build: `npm --prefix backend run build && npm run build` → estáticos en `dist/`.
- `api/index.js` exporta la app Express como Vercel Function (`maxDuration` 300 s). `/api/*`, `/health` y `/ready` se reescriben hacia ella, así que el frontend usa el mismo dominio.

Pasos:

1. Importa el repositorio en Vercel (Framework: Vite; la raíz del proyecto es la raíz del repo).
2. **No** configures `VITE_API_URL` (o déjalo vacío): el frontend llama a `/api` en su propio dominio.
3. Agrega como variables de entorno (Production) todas las de `backend/.env.example`: `NODE_ENV=production`, secretos JWT, Supabase, Mercado Pago, Stripe, `DEVICE_ENROLLMENT_SECRET` y `AUTH_BOOTSTRAP_ADMIN_HASH`. Los dominios `*.vercel.app` del proyecto se agregan solos a `ALLOWED_ORIGINS`; incluye ahí sólo dominios propios. `PUBLIC_ORDERING_URL` debe ser el dominio final.
4. Actualiza las URLs de webhooks: `https://<tu-dominio>/api/webhooks/mercadopago` y `https://<tu-dominio>/api/webhooks/stripe`.
5. Aplica las migraciones de Supabase (incluida `006_orders_updated_at_trigger.sql`) antes del primer despliegue.

Diferencias por ser serverless:

- **Tiempo real**: cada instancia tiene su propia memoria, así que el stream SSE (`/api/events`) consulta `orders.updated_at` cada `REALTIME_POLL_MS` (3 s) y reenvía cambios; se cierra a los `SSE_MAX_DURATION_MS` (270 s) y el cliente reconecta solo.
- **Conciliación de pedidos QR**: el webhook de Stripe es la vía principal; además se consulta Stripe cuando el cliente revisa su pedido y, mientras haya un POS/KDS conectado, se barren los pendientes cada minuto. No se usan tareas programadas.
- **Rate limiting** es por instancia (en memoria); es una defensa básica, no global.
- La base JSON local no funciona en Vercel (sistema de archivos efímero); producción exige Supabase.

### Supabase

- Aplica las migraciones antes del despliegue del backend.
- Restringe el service-role key al proceso backend.
- Activa Point-in-Time Recovery o backups diarios según el plan.
- Consulta [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) antes de operar con dinero real.

### Terminal de autoservicio (tablet Android)

`/kiosk` es la terminal de autoservicio táctil (vertical y horizontal) y `android-kiosk/` la APK que la muestra a pantalla completa en modo kiosco. Arquitectura y decisiones: [docs/KIOSK.md](docs/KIOSK.md). Instalación en la Lenovo Tab M10, Device Owner, firma y ADB: [android-kiosk/README.md](android-kiosk/README.md).

## Operación y diagnóstico

- `/health`: proceso Express vivo.
- `/ready`: acceso al repositorio de productos disponible.
- Todos los logs son JSON e incluyen `requestId`; pagos incluyen referencias de pedido/proveedor sin secretos.
- Si aparece “Sesión vencida”, vuelve a iniciar sesión. Si una terminal pierde autorización, regístrala otra vez o revisa `devices`.
- Si Point no responde, conserva el pedido pendiente y ofrece efectivo; nunca simules un éxito en producción.

La secuencia de apertura, caída de red, compra, merma, devolución y cierre está documentada en [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Estado de preparación y evidencia

Consulta [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) para los cambios verificados y los requisitos de la validación real. Para retomar el desarrollo (por ejemplo, con Codex en local), empieza por [docs/CODEX_HANDOFF.md](docs/CODEX_HANDOFF.md). El repositorio incluye CI con build, lint, tipos, pruebas, auditoría de dependencias, navegador y PostgreSQL.

Para desarrollo o autohospedaje sigue disponible el contenedor: `docker build -t rofe-api ./backend`. Producción se despliega en Vercel.
