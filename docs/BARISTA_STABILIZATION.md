# ROFÉ Barista: sprint de estabilización

Fecha: 6 de noviembre de 2026. Rama: `codex/barista-operation-stabilization`, desde `main` `6cfb68f`. Propuesta para revisión en Draft, sin promoción a producción. ROFÉ Point y su PR #7 permanecen independientes.

## Estado y alcance

Se prepararon tres correcciones: límites de entorno, conciliación backend de órdenes Point existentes y cierre transaccional con atribución por confirmación. No se ejecutaron pagos, cierres, migraciones, cambios de variables, dispositivos, terminales ni despliegues productivos.

**Esto todavía no habilita la operación corregida en producción.** Faltan la separación remota de variables, la aprobación de las migraciones 010/011, una publicación coordinada y un programador autenticado. El plan de ejecución y reversión está en [BARISTA_STABILIZATION_ROLLOUT.md](BARISTA_STABILIZATION_ROLLOUT.md).

## 1. Aislamiento de entornos

El GET de metadatos de Vercel confirmó 17 registros. Hay registros únicos que incluyen simultáneamente producción y otros ámbitos:

| Configuración | Ámbitos compartidos detectados |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | producción, preview, development |
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` | producción, preview, development |
| `POINT_DEVICE_ID` | producción, preview |
| `JWT_ACCESS_SECRET`, `DEVICE_ENROLLMENT_SECRET` | producción, preview, development |
| `JWT_REFRESH_SECRET` | producción, preview |
| `AUTH_BOOTSTRAP_ADMIN_EMAIL`, `AUTH_BOOTSTRAP_ADMIN_HASH`, `AUTH_BOOTSTRAP_BARISTA_EMAIL`, `AUTH_BOOTSTRAP_BARISTA_HASH` | producción, preview |
| `PUBLIC_ORDERING_URL` | producción, preview |

`STRIPE_SECRET_KEY` está limitado a producción. Los registros de `STRIPE_WEBHOOK_SECRET` son distintos por ámbito; se debe comprobar que sus valores pertenezcan a cuentas aisladas antes de habilitar pagos fuera de producción. Un valor omitido por la API para una variable sensible **no significa que esté vacío o ausente**. No se descargaron ni imprimieron valores para esta comprobación de ámbitos.

Medidas preparadas:

- `api/environment-boundary.js` devuelve 503 en Vercel preview/development o sin etapa reconocida, **antes de importar** el backend. No se inicializan Supabase, autenticación ni integraciones.
- `getEnv()` rechaza el arranque del backend en esos despliegues, incluso fuera del entrypoint habitual.
- Desarrollo rechaza credenciales remotas heredadas de Supabase, Point o Stripe. `npm run dev`, E2E y Vitest utilizan datos locales/temporales y vacían expresamente las integraciones. No se decide si una credencial es de prueba por su prefijo.
- El frontend compilado como preview ignora `VITE_API_URL` y usa exclusivamente su origen, cuyo backend está bloqueado.
- `vercel.json` deshabilita el despliegue Git automático **de esta rama concreta**, para publicar el Draft sin activar una preview. No cambia el despliegue de `main`.
- `scripts/audit-environment-metadata.mjs` analiza exclusivamente nombres, ámbitos y tipo de almacenamiento; rechaza ámbitos compartidos con código de salida 1. Nunca copia valores ni propietarios al informe.

**Límite:** el código defensivo no impide que otro código de build lea variables ya inyectadas. La separación completa exige retirar los ámbitos no productivos de los registros remotos compartidos y revisar previews antiguas. No se ha hecho esa modificación en este sprint.

## 2. Conciliación autónoma Point

Causa: el webhook y las consultas del Kiosco podían confirmar pagos; la cola Barista no sustituía esas consultas. Cerrar el navegador podía dejar un pago pendiente localmente.

Nuevo flujo preparado:

1. Un programador invoca `GET /api/internal/point-reconciliation` con un bearer independiente `CRON_SECRET`.
2. Con `POINT_RECONCILIATION_ENABLED=true`, el backend reclama hasta cinco pedidos elegibles mediante una concesión persistente de 180 segundos. Se excluyen Stripe, QR_PICKUP, órdenes recientes y estados finales.
3. Consulta únicamente `GET /v1/orders/{id}` mediante el servicio existente. Comprueba identificador de proveedor y referencia local antes de conciliar.
4. La confirmación conserva las validaciones de referencia, importe, moneda y propina y la frontera SQL existente de inventario/pago. Los webhooks, consultas y workers concurrentes no pueden consumir de nuevo una venta confirmada.
5. Registra resultado, número de intentos y próxima consulta, con espera progresiva de 60 segundos hasta una hora. Cada actualización requiere el token de la concesión actual; un worker anterior no puede sobrescribirla.

No se llama a crear/cancelar/reembolsar una orden financiera desde este worker. Un timeout conserva el pedido pendiente y sus reservas. Si el proceso termina sin registrar el resultado, la concesión vence y la siguiente ejecución consulta de nuevo el mismo identificador.

La tabla `point_reconciliation_jobs` usa RLS; solo el backend de servicio puede consultar sus registros y ejecutar las funciones restringidas. El endpoint no acepta sesiones POS, BARISTA, ADMIN o MANAGER como sustituto del secreto del programador. La falta de ese secreto bloquea el endpoint, sin detener los cobros habituales.

### Excepciones y pérdida de referencia

Administración → Terminal Point muestra pendientes, antigüedad, intentos, estado de revisión y acceso a consultar una orden existente. No muestra clientes, credenciales ni payloads financieros.

- `MISSING_REFERENCE`: falta el ID de la orden financiera. Un webhook firmado puede recuperarlo tras un GET verificado y comprobación de importe y referencia; Administración también puede aportar un ID obtenido de Mercado Pago, sujeto a las mismas verificaciones.
- `REFERENCE_MISMATCH` / `AMOUNT_MISMATCH`: conserva el estado local; requiere revisión.
- `PROVIDER_ERROR`: no se pudo consultar al proveedor; se reintentará GET.
- `LOCAL_CONFIRMATION_ERROR`: el proveedor respondió pero el registro local falló, por ejemplo por inventario. Requiere revisión sin volver a cobrar.

**Límite explícito:** si se pierde el ID antes de persistirlo y no llega el webhook, el worker no adivina por importe ni genera otra orden. Queda la recuperación administrativa del ID. No se implementó una búsqueda Point por referencia sin una API oficialmente validada para esa modalidad.

La conciliación queda apagada por defecto. El archivo `ops/vercel.point-cron.example.json` es un ejemplo inactivo, no una programación desplegada. Debe verificarse la disponibilidad del intervalo elegido en el plan de Vercel o contratar un programador seguro independiente de las tablets y de la Mac. Cinco GET por minuto permiten hasta 300 consultas/hora, no una garantía de volumen ilimitado; las métricas reales deben determinar la capacidad y el umbral de alertas.

## 3. Cierre y atribución de caja

Causa: la API calculaba efectivo esperado y reporte antes de que la función SQL bloqueara la sesión. Un cobro que terminara durante esa ventana podía quedar fuera del corte. Además, los reportes elegían las ventas por fecha de creación del pedido.

Corrección propuesta en 010:

- Agrega `orders.paid_at`, `paid_cash_session_id` y `refunded_at`, sin backfill ni reescritura de históricos.
- Confirmaciones y reembolsos bloquean primero la sesión abierta y después el pedido/inventario. Las compras en efectivo respetan el mismo orden de bloqueos para evitar inversión.
- Las nuevas entradas del ledger quedan ligadas al turno y se fechan después de esperar su bloqueo. Los movimientos de inventario y `orders.updated_at` utilizan reloj de publicación, evitando conservar el inicio de una transacción que estuvo esperando.
- `close_cash_session_consistent` bloquea el turno, vuelve a calcular el efectivo y obtiene el reporte en un único snapshot SQL. Persiste sesión, denominaciones y ambos reportes en la misma transacción. No acepta cifras calculadas por el navegador.
- El cierre se identifica por el turno. Mismo turno, usuario y conteo devuelve el cierre persistido; un conteo diferente produce conflicto. Un reintento nunca cierra el siguiente turno.
- El adaptador JSON calcula y persiste dentro de su cola de mutaciones. No se utiliza como sustituto del bloqueo SQL en producción.
- Las ventas se atribuyen por confirmación; los reembolsos, por fecha de reembolso, incluso si pertenecen a un pedido creado o pagado en un periodo anterior.

Si una tarjeta se confirma después de cerrar y sin otro turno abierto, se conserva el pago con `paid_at` y sin turno asociado. Administración lo muestra en **Confirmados fuera de turno**. Cuenta en el reporte por fecha de pago, pero no se incorpora retrospectivamente a un corte cerrado ni se reasigna automáticamente. Operación debe abrir turno antes de admitir pedidos y revisar estas excepciones.

Los reportes históricos de aplicación conservan un fallback explícitamente contado como `estimatedPaymentDates` cuando no existe fecha de pago/inventario. El nuevo corte SQL no infiere una fecha financiera a partir de la creación de un pedido histórico sin evidencia. La regularización histórica requiere conciliación aparte; no se altera aquí.

El cierre sigue devolviendo el resumen de cupones. Emitidos/canjeados quedan acotados al intervalo del corte; `outstanding`, activos y reservas expresan el pasivo vigente al consultar, no una instantánea histórica del pasivo. No participan como entrada del cálculo transaccional del efectivo.

### Compatibilidad que requiere revisión antes de publicar

El cuerpo de `POST /api/admin/cash/session/close` ahora requiere `sessionId`, además de denominaciones y notas opcionales. Se actualizaron Administración y los clientes de prueba. Un cliente antiguo recibe 400 sin cerrar ninguna sesión. **Esta modificación del contrato de caja queda pendiente de aprobación para su activación productiva.** Deben publicarse juntos API y frontend, actualizar la PWA y recargar las pantallas administrativas.

Con esquema 009 el backend nuevo mantiene pedidos, Point, webhooks y cobros existentes, pero bloquea el nuevo cierre con `CASH_MIGRATION_REQUIRED` hasta aplicar 010. La conciliación programada exige 011. Esas barreras evitan degradarse silenciosamente al cierre vulnerable.

No se modifica el payload de creación de Orders API, sus credenciales, terminal, sucursal, caja, modo SELF_SERVICE, firma de webhooks ni los paquetes Android. Las columnas nuevas son aditivas y las firmas de confirmación SQL existentes se conservan. Las funciones antiguas de cierre se mantienen por compatibilidad de esquema; no deben usarse como alternativa operativa al cierre corregido.

## Pruebas y evidencia

- Frontend: 43 pruebas unitarias, incluidas entrada de preview sin importación, URL de API y redacción de metadatos.
- Backend: 98 pruebas unitarias/integración, incluidas permisos, autenticación del programador, recuperación de referencia, consultas fallidas, concurrencia, fencing, consumo único, cierres y fechas de pago/reembolso.
- PostgreSQL 16 desechable, socket privado, sin `DATABASE_URL` real y con `pg-safeupdate` fijado: apertura/movimientos/cierre, rollback, concurrencia, ocho cierres repetidos, concesiones persistentes entre conexiones, cobro antes del corte y tarjeta después del corte.
- Primera aplicación y reaplicación de 010/011 sobre históricos ficticios: huellas de sesiones, caja, movimientos, pedidos e inventario sin alteración de los valores preexistentes.
- E2E: 82 pruebas aprobadas en la suite completa del navegador, incluida la regresión de cupones y el panel de pendientes. Los checks de CI se consultan en el PR.
- Captura del panel con datos de prueba: [barista-stabilization-point.png](evidence/barista-stabilization-point.png).
- Lint, typecheck de ambos proyectos, builds frontend/backend y validación PWA. El navegador emula la M10; esto no acredita una prueba física Android ni un pago real.

Una ejecución inicial detectó que se había omitido el resumen de cupones en la respuesta del cierre. Se corrigió y la regresión volvió a pasar. No se eliminó ni debilitó la aserción financiera.

## Pendientes antes de operación real

1. Separación de secretos remotos y revisión de previews históricas: bloqueante.
2. Aprobar contrato de cierre, aplicar 010/011 y publicar coordinadamente: bloqueante.
3. Activar y monitorizar el programador autónomo; probar recuperación con la tablet cerrada en entorno aislado: bloqueante para considerar autónoma la conciliación.
4. Recuperar IDs faltantes y revisar pagos fuera de turno sin ajustar históricos manualmente.
5. Completar pruebas físicas de las dos M10 y de Point con una operación expresamente autorizada. No se realizaron durante este sprint.
6. Continúan fuera de alcance la regularización física del azúcar de producción, las recetas pendientes de revisión y una segunda terminal. El proveedor sigue utilizando una sola `POINT_DEVICE_ID`; no se presume compatibilidad multi-terminal sin diseño y pruebas específicos.

## Fuentes oficiales consultadas

- [Mercado Pago Point: procesamiento y consulta de órdenes](https://www.mercadopago.com.mx/developers/es/docs/mp-point/payment-processing).
- [Vercel: separación de entornos y variables](https://vercel.com/docs/environment-variables/manage-across-environments).
- [Vercel: variables sensibles](https://vercel.com/docs/environment-variables/sensitive-environment-variables).
- [Vercel: despliegues por rama](https://vercel.com/docs/project-configuration/git-configuration).
- [Vercel: autenticación y límites de cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
