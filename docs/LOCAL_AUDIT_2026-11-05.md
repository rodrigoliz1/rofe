# Auditoría local y seguridad — 5 de noviembre de 2026

## Resultado y alcance

Entorno de desarrollo funcionando en esta Mac, aislado de Supabase y de proveedores de pago. La aplicación todavía requiere validación operativa real antes de declararla lista para producción.

Se leyeron el handoff, README, PRODUCT, DESIGN, la documentación de `docs/` y la guía Android. Se revisaron en código el enrutamiento, checkout, autenticación, persistencia, pagos, caja, cupones, tiempo real, catálogo, PWA y configuración de despliegue/CI. No fue una prueba de penetración ni una certificación de todos los caminos del código.

No se realizaron pushes, merges, despliegues, migraciones remotas ni cargos reales. La única consulta remota deliberada de esta auditoría fue un **GET** a `/rest/v1/rpc/rofe_schema_version`: HTTP 200, valor **8**. Confirma lo informado por el dueño, sin leer pedidos/clientes ni ejecutar cambios. La validación funcional remota de cupones, pagos y cortes sigue pendiente.

## Integridad del repositorio

- Repositorio: `rodrigoliz1/rofe`; rama `claude/kiosk-production-hardening`; HEAD inicial `d012fe6`.
- `git fetch origin` completado. Diferencia inicial HEAD/remoto: **0 por delante / 0 por detrás**; árbol inicialmente limpio.
- El commit de implementación de Claude `e4b95f6` es ancestro de HEAD. Comparar HEAD con `origin/main` sólo muestra diferencias de documentación (README, handoff, preparación de producción): el código del PR #2 está completo localmente.
- `origin/main` contiene el merge `2650b80`; la rama Android no tiene commits pendientes fuera de main. El handoff documenta el squash del PR #1 y su rama histórica; no se intentó reproducir ni fusionar esos commits originales.
- Al terminar la auditoría inicial, sus modificaciones quedaron locales y sin commit. Con la autorización posterior del dueño se conservan en `codex/rofe-development` mediante un commit local, sin push.

## Dependencias y las 19 alertas originales

Node **24.14.1**, npm **11.11.0**, compatibles con el requisito Node >=22.12. Las dependencias ya estaban instaladas; se comprobaron y se actualizaron las resoluciones necesarias mediante `npm audit fix` **sin force**, más una actualización explícita de Vitest/coverage dentro de la serie 4.1.

| Auditoría | Inicial | Final |
|---|---:|---:|
| Frontend completo | 14 moderadas + 5 altas | **10 moderadas, 0 altas** |
| Frontend `--omit=dev` | 0 | **0** |
| Backend completo | 0 | **0** |
| Backend `--omit=dev` | 0 | **0** |

Los 19 registros de npm son **paquetes afectados**, no 19 fallos independientes: npm propaga el riesgo a sus consumidores. Todos pertenecían a `devDependencies` o a su árbol transitivo. No forman parte de las dependencias de ejecución del frontend desplegado ni del servidor Express. Sí pueden afectar al equipo/CI cuando ejecutan herramientas de desarrollo o construyen el artefacto.

Inventario completo; D = dependencia directa de desarrollo, T = transitiva de desarrollo:

| Paquete | Nivel original / tipo | Versión inicial → final | Estado |
|---|---|---|---|
| `@eslint/config-array` | Moderada / T | 0.23.5 → 0.23.5 | Hereda `minimatch`, pendiente |
| `@eslint/js` | Moderada / D | 10.0.1 → 10.0.1 | Hereda ESLint, pendiente |
| `@typescript-eslint/eslint-plugin` | Moderada / T | 8.61.0 → 8.72.1 | Hereda parser/utils, pendiente |
| `@typescript-eslint/parser` | Moderada / T | 8.61.0 → 8.72.1 | Hereda estree, pendiente |
| `@typescript-eslint/type-utils` | Moderada / T | 8.61.0 → 8.72.1 | Hereda estree/utils, pendiente |
| `@typescript-eslint/typescript-estree` | Moderada / T | 8.61.0 → 8.72.1 | Hereda `minimatch`, pendiente |
| `@typescript-eslint/utils` | Moderada / T | 8.61.0 → 8.72.1 | Hereda estree, pendiente |
| `@vitest/coverage-v8` | Moderada / D | 4.1.11 → 4.1.12 | Corregido |
| `@vitest/mocker` | Moderada / T | 4.1.11 → 4.1.12 | Corregido |
| `baseline-browser-mapping` | Moderada / T | 2.10.37 → 2.11.35 | Corregido |
| `brace-expansion` | Alta / T | 5.0.9 → 5.0.12 | Corregido |
| `browserslist` | Alta / T | 4.28.2 → 4.29.5 | Corregido |
| `eslint` | Moderada / D | 10.5.0 → 10.14.0 | Hereda `minimatch`, pendiente |
| `minimatch` | Moderada / T | 10.2.5 → 10.2.6 | Pendiente |
| `source-map-js` | Alta / T | 1.2.1 → 1.2.2 | Corregido |
| `typescript-eslint` | Moderada / D | 8.61.0 → 8.72.1 | Hereda su cadena, pendiente |
| `vite` | Alta / D | 8.0.16 → 8.3.6 | Corregido |
| `vitest` | Moderada / D | 4.1.11 → 4.1.12 | Corregido |
| `zod` (frontend) | Alta / T | 4.4.3 → 4.6.7 | Corregido; el Zod del backend ya estaba sano |

### Cadenas e impacto real

- **ESLint → config-array/minimatch** y **typescript-eslint → plugin/parser/type-utils/utils → typescript-estree → minimatch**. Un patrón glob manipulado puede amplificar CPU/memoria. Los patrones de este proyecto provienen de configuración local; no se recibe un glob del cliente del POS. Riesgo en lint/CI con configuración o archivos no confiables, no una ruta expuesta de Express. Las diez alertas restantes corresponden a esta única raíz. [Aviso de minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- **ESLint/typescript-estree → minimatch → brace-expansion**. Recursión y expansión de llaves pueden agotar pila/CPU. 5.0.12 corrige los avisos originales. [Recursión](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [expansión cuadrática](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- **eslint-plugin-react-hooks → Babel → helper-compilation-targets → browserslist → baseline-browser-mapping**. Consultas o estadísticas manipuladas pueden provocar crecimiento de memoria, escritura de prototipo o terminar un proceso de herramientas. No se usan estadísticas del cliente en ROFÉ. [Browserslist](https://github.com/advisories/GHSA-73wf-gq98-2v4g), [baseline](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv).
- **Vite → PostCSS → source-map-js**, además de **coverage-v8 → magicast → source-map-js**. Un source map indexado malicioso puede bloquear el event loop durante procesamiento de herramientas. [Aviso](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- **Vite**: los avisos combinan riesgos de `launch-editor` (varios específicos de Windows), ejecución entre orígenes en middleware y lectura fuera de `server.fs.allow` en sistemas no Windows. La lectura de archivos sí interesa en una Mac si el servidor vulnerable es accesible. Se actualizó Vite y el desarrollo ahora escucha exclusivamente en loopback. [Avisos de Vite](https://github.com/vitejs/vite/security/advisories), [lectura de archivos](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22).
- **Vitest/coverage → mocker**: registro manual de mocks sin autenticación permite inyectar código en el contexto de pruebas; otro aviso implica traversal con barras de Windows. ROFÉ utiliza `vitest run` en Node, sin servidor de browser mocks expuesto. Se corrigió igualmente a 4.1.12. [Aviso del mantenedor](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8).
- **eslint-plugin-react-hooks → zod**: colecciones sobredimensionadas pueden agotar memoria durante validación. Esta copia se utiliza en tooling, no en las validaciones HTTP del backend. [Aviso](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

### Por qué quedan diez moderadas

El parche publicado para `minimatch` es **11.0.1**. ESLint 10.14 y typescript-estree 8.72 aún solicitan la serie 10. La versión 11 elimina APIs (`makeRe`, `AST`, etc.) y cambia la representación de los patrones. Imponerla con un override mayor no es una actualización transparente; degradar ESLint/typescript-eslint según las sugerencias automáticas tampoco es una corrección rutinaria para este proyecto. Se conservaron las versiones compatibles y se documenta el riesgo pendiente. [Changelog del mantenedor](https://github.com/isaacs/minimatch/blob/main/changelog.md).

Próximo paso de mantenimiento: adoptar versiones upstream compatibles con minimatch corregido y repetir lint/tipos/pruebas/build. No se ejecutó `npm audit fix --force`, no se ocultaron alertas y no se modificaron políticas de CI para ignorarlas.

## Seguridad del desarrollo

El `.env` original mezclaba desarrollo, simulación y credenciales reales; había un backend local activo con ese perfil. Se detuvo ese proceso local y se dejó un lanzador que fuerza servicios remotos deshabilitados, API/servidor web en loopback, puertos fijos y base local independiente. `backend/.env` se conservó. No se comprobó la vinculación real de Point ni se arrancó deliberadamente una nueva sesión contra producción.

Las pruebas unitarias ahora anulan explícitamente credenciales externas heredadas. E2E antes compartía `backend/security-devices.json` con desarrollo y reutilizaba una ruta JSON fija que borraba al arrancar; ahora usa un directorio temporal nuevo para ambos archivos. Una prueba de regresión verifica que la fábrica de persistencia de dispositivos respeta el archivo aislado.

Vite bloquea por HTTP el árbol backend y `.rofe-local/`, además de secretos y metadatos Git. Se verificó **403** para la semilla JSON, datos/dispositivos locales, fuentes backend y `.env`; `/ready` se dirige a la API y responde 200. El watcher ignora datos privados y el build E2E para no provocar recargas mientras se realizan pruebas o se usa el navegador.

SHA-256 comparado antes/después de las suites: **sin cambios** en `backend/.env`, `backend/db.json` y `backend/security-devices.json`. Los perfiles privados y `.rofe-local/` están ignorados por Git. No se imprimieron valores de credenciales. La búsqueda de los secretos originales en el diff y en ambos builds frontend encontró cero coincidencias.

## Arquitectura y módulos

| Capa / módulo | Implementación y revisión |
|---|---|
| Frontend | React 19 + TypeScript + Vite; `AppRouter` separa `/`, `/kiosk`, `/pedir`; vistas lazy de barista/admin. API por mismo origen, refresh httpOnly y outbox IndexedDB. |
| Kiosco | Reutiliza App, catálogo, carrito y checkout. Layout por orientación física, inactividad, recuperación de sesión, conectividad, back stack y acceso de personal por pulsación larga. E2E M10 horizontal/vertical. |
| POS / checkout | Precios recalculados en servidor; dispositivo autorizado; UUID idempotente y borrador persistido; recuperación de un cobro sin crear otro. Offline exclusivo de efectivo, sin tarjetas/cupones confirmados offline. |
| Barista / KDS | Flujo de estados hasta entrega, cobro de pedidos en efectivo y pago de cupones; permisos del servidor, SSE y recuperación por consultas. |
| Caja | Apertura y cierre, conteo por denominaciones, cambio exacto, compra/stock/caja transaccionales y devoluciones; pruebas de diferencias cero. |
| Cupones | Pasivo separado de descuento/venta; emisión, aplicación, reserva, liberación, pago en efectivo y cancelación auditada. SQL con bloqueos y operaciones idempotentes. 008 confirmada aplicada. |
| Administración | Catálogo/fotos/recetas, inventario, proveedores/compras, merma/producción, reportes/cortes, accesos/dispositivos, historial de cupones y configuración QR/Point. Middleware ADMIN/MANAGER; operaciones sensibles sólo ADMIN. |
| Backend / base | Express + Zod; `index.ts` concentra rutas; módulos de dominio/auth/payments/catalog/pickup; interfaz DbAdapter, JSON serializado y Supabase con funciones PostgreSQL atómicas. |
| Pagos y operación | Orders API Point, Stripe Checkout QR, firma de webhooks y conciliación idempotente. Simulaciones verifican lógica; no acreditan proveedores reales. |
| Hosting / Android | Vercel sirve estáticos y Express mediante `api/index.js`; SSE hace polling por instancia. APK Kotlin restringe WebView y añade Lock Task/Device Owner, PIN y autoarranque. No se modificaron ni publicaron estos despliegues. |

## Verificación de esta Mac

| Verificación | Resultado |
|---|---|
| Lint raíz y backend | Pasa, 0 errores; 2 advertencias previas en `supabaseAdapter.ts` (directiva duplicada y `any`) |
| Typecheck frontend/backend | Pasa |
| Vitest frontend | **29/29** |
| Vitest backend | **56/56** (55 existentes + regresión de aislamiento) |
| Builds frontend/backend | Pasan; PWA válida, 4 iconos y 66 recursos precargados |
| Playwright sobre builds | **75/75**, 3 proyectos; última ejecución 2.8 minutos después del ajuste final de Vite |
| PostgreSQL 16 temporal | Migraciones 001–008, flujos contables y concurrencia pasan |
| Navegador visible contra Vite real | POS con catálogo local, kiosco, menú QR y acceso de equipo cargan; cero errores JS y peticiones HTTP remotas en el recorrido |
| API local | `/health` → ok; `/ready` → ready |
| Archivos privados desde Vite | 5 comprobaciones HTTP → 403 |
| Android nativo en esta Mac | No ejecutado: no hay JDK 17/Android SDK configurados. La evidencia histórica de CI está en la guía Android; no se sustituye por una prueba local nueva |

Las cuentas de personal existentes conservan sus hashes; la prueba de login/operación ADMIN y BARISTA se realizó con cuentas exclusivas E2E. No se conocen ni se restablecieron las contraseñas existentes para iniciar sesión de personal en el perfil de desarrollo. El POS del navegador de comprobación sí quedó autorizado localmente. Ver direcciones y uso en [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).

Evidencias de esta ejecución en `/tmp/rofe-local-audit/`: `verify.log`, `backend-lint.log`, `e2e.log`, `postgres.log`, auditorías JSON antes/después, `schema-readonly.json`, `browser-smoke.json`, `pos-local.png`, `kiosk-local.png`. `/tmp` es temporal; el reporte versionable conserva el resultado. Playwright deja además `playwright-report/index.html`.

## Pendientes para producción

1. **Validación financiera real autorizada:** efectivo con cupón, uso parcial/total, pago del saldo, cancelación/devolución y corte físico con diferencia cero; Point por el total menos cupón, cancelación/devolución, webhook y conciliación de inventario/ledger. Las pruebas actuales son locales/simuladas.
2. **Pagos QR:** confirmar configuración y entrega real de eventos Stripe, origen HTTPS definitivo, prueba con claves test y posterior validación live autorizada.
3. **Hardware:** firmar release con keystore conservado de forma segura, instalar M10 como Device Owner; probar cámara en navegador de caja/iPad, rotación/teclado/red/autoarranque, actualización de PWA/APK y recuperación. La WebView kiosco no concede cámara.
4. **Operación:** confirmar backups/PITR y restauración en base aislada, monitorización de webhooks/errores y `/ready`, permisos/RLS y secretos del despliegue real, procedimiento de apertura/cierre e incidentes. No se verificó toda la configuración remota.
5. **Política de cupones:** contador debe definir fiscalidad y vigencia; las reservas de pedidos pendientes abandonados siguen necesitando cancelación por gerente (distintas de reservas huérfanas sin pedido, que sí se liberan).
6. **Mantenimiento de seguridad:** resolver la raíz minimatch cuando los consumidores soporten la versión corregida; rate limiting global en lugar de memoria por instancia; corregir las dos advertencias de lint.
7. **Catálogo:** colección definitiva (8 fotos interim y 4 pending según manifiesto) y licencias de fotografías antiguas.
8. **Escala y disponibilidad:** revisar lecturas completas del histórico en reportes/caja y polling SSE (últimas 24 h, límite 500), paginación/carga y límites de Functions antes de aumentar volumen. Son riesgos por inspección; no se ejecutó una prueba de carga ni se reprodujo una pérdida de eventos.
9. **Documentación/publicación:** los cambios de documentación previos y esta auditoría permanecen en la rama; cualquier PR/push/merge/despliegue requiere autorización del dueño. Documentos PWA/QR históricos describen estados de sesiones anteriores; este reporte es la evidencia local actual.

La migración 008 **ya no es un pendiente**. El entorno local está preparado para continuar programando; su funcionamiento no equivale a una aprobación de producción.
