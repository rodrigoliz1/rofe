# Controles previos de publicación — 5 de noviembre de 2026

Autorización: el dueño permite push de `codex/rofe-development`, PR y merge a `main` cuando los controles técnicos pasan. La validación financiera real y la instalación física se mantienen separadas de los controles automáticos; nunca se dan por hechas.

## Datos y esquema

Supabase respondió por lectura `rofe_schema_version() = 8`; las tablas esperadas son compatibles con los campos JSON existentes de personalizaciones y pedidos. No se requiere ni se aplica otra migración. La revisión no crea pedidos, cargos, cancelaciones, cortes ni movimientos de efectivo en la base real.

El catálogo real contiene 13 productos, incluido Capuccino, frente a ocho en el perfil local. Se comprobaron cotizaciones base para los 13 sobre una copia de sus datos, sin cambiar precios ni recetas. Ocho productos admiten dos sobres de Splenda con cantidades/costos resueltos; Espresso y Americano conservan su bandera administrativa de no personalizables. Panadería conserva sus recetas sin opciones de bebidas.

Las 500 unidades de azúcar tienen unidad `un`, sin compras ni movimientos de ese ingrediente en el historial consultado; no permiten inferir gramos por unidad. Se conservan intactas. Poco 2 g, Normal 4 g y Mucho 8 g quedan en configuración administrativa deshabilitada. El backend rechaza su habilitación/selección hasta usar un insumo medido correctamente en gramos.

Se detectaron recetas calientes con 250–280 ml de leche frente al vaso base de 8 oz, y bebidas frías sin cantidad de hielo. No se corrigen inventando datos: los tamaños calientes quedan en borrador y no se ofrece nivel de hielo hasta definir su receta. El tamaño frío medido sustituye además el vaso de 12 oz por 16 oz; conserva la receta base y añade su variación configurada. Estos pendientes son visibles en el plan administrativo y no impiden vender la receta base existente.

`node scripts/rollout-production-catalog.mjs` genera un respaldo/plan privado y cotizaciones de comprobación. Sólo `--apply`, después del despliegue web, permite PATCH a `products.custom_variants`, con comprobaciones contra cambios administrativos concurrentes. No escribe stock, unidades, precios base, recetas base, usuarios ni historia. Conserva grupos antiguos como borradores y sus opciones para revisión. El plan no contiene credenciales y permanece fuera de Git.

## Entorno y servicios

`/health` y `/ready` de producción responden 200; el menú QR informa habilitado y contiene 13 productos. Existe personal ADMIN y BARISTA activo, comprobado por lectura sin contraseñas ni hashes. La consulta de Mercado Pago reconoce la terminal en modo PDV; no se generó ningún cargo.

La configuración de arranque de producción exige `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AUTH_BOOTSTRAP_ADMIN_HASH`, `DEVICE_ENROLLMENT_SECRET`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `POINT_DEVICE_ID`, orígenes HTTPS y simulación apagada. La disponibilidad del backend desplegado verifica ese control de arranque; no equivale a haber leído los valores del panel Vercel. La copia local protegida carece de `MERCADO_PAGO_WEBHOOK_SECRET`; no se usa para reemplazar el entorno desplegado. No se sobrescriben variables remotas.

La integración GitHub/Vercel del proyecto existente publica previews por rama y `main` en `rofe.vercel.app`; no se crea otro proyecto ni se usa un servicio de publicación alterno. El estado del nuevo despliegue, URL de PR y commit final deben confirmarse en GitHub/Vercel después del push.

## Android

[Guía de producción, certificados, versiones y transición sin borrar datos](../android-kiosk/PRODUCTION.md). Dos release HTTPS firmadas con claves persistentes independientes; secretos de CI configurados y respaldo cifrado comprobado. La debug Kiosco código 7 corresponde al certificado efímero del runner 7, cuya clave privada no está disponible. No se desinstala ni se intenta reemplazar su firma.

La M10 conectada fue identificada por el dueño como Barista. Falta inspección directa de la M10 de clientes, ingreso manual de credenciales en las release y prueba de operación real autorizada. Estas condiciones no se sustituyen por una prueba de navegador.

## Verificación automática

Lint y typecheck frontend/backend, 32 pruebas frontend, 67 backend (incluidas dos regresiones del catálogo de producción), 78 E2E, builds/PWA, PostgreSQL 001–008 y concurrencia aislados. Android: 22 pruebas Kiosco y 17 Barista, lint release y builds firmadas. Auditoría npm de producción: cero vulnerabilidades; permanecen 10 moderadas de tooling de desarrollo previamente documentadas.

Las pruebas de caja, pagos, cupones y reintentos confirman atomicidad/consumo único en fixtures locales y SQL temporal. Se exige además CI y preview del PR antes del merge. La publicación no prueba por sí sola los sensores, conectividad ni pagos reales de las M10.
