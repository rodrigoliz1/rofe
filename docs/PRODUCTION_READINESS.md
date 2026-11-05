# Preparación de producción — 4 de noviembre de 2026

El código compila y los recorridos locales descritos abajo pasan. **La puesta en producción real está pendiente:** este entorno no tiene Supabase ni credenciales/terminal Point de producción. No se ha realizado ningún cargo real, migración remota, publicación o despliegue como parte de esta revisión.

## Implementado

- POS con búsqueda, categorías, personalización, carrito, navegación de equipo y composición para escritorio, iPad y teléfono.
- Estilos organizados por superficie, fuentes locales, foco visible, íconos consistentes y manejo del foco en los diálogos principales.
- Cliente API con errores de transporte diferenciados de rechazos del servidor; un HTTP 400/409 no crea una venta offline.
- Recuperación persistente del cobro al recargar; consulta de estado complementaria a SSE. La recarga no reenvía el cobro.
- Pedido guardado antes del envío a Point, referencia e importe estables y reintentos idempotentes.
- Conciliación compartida de webhook/consulta, validación de referencia e importe, propina separada y protección frente a eventos tardíos de aprobación o rechazo.
- Reserva de insumos durante un cobro Point. La restricción PostgreSQL impide consumir esas existencias con ajustes, merma o producción concurrente. Pago o cancelación liberan la reserva en la misma transacción.
- Consulta administrativa de vinculación y modo de la terminal. El resultado distingue configuración local de verificación con Mercado Pago.
- Compras en efectivo con desglose de denominaciones. Compra, stock, ledger y retiro de caja confirman o revierten juntos.
- Edición de productos y recetas conectada a rutas reales, subida de imágenes validada y errores visibles al guardar.
- Cola offline con reintentos, recuperación de operaciones interrumpidas y aislamiento de pedidos inválidos.
- PWA con precarga de recursos y catálogo en IndexedDB. Una actualización espera a que se cierren las pestañas existentes.
- Lecturas históricas paginadas en el adaptador Supabase para evitar reportes truncados por el límite de filas.
- Persistencia JSON local con escritura atómica y serialización de lecturas/escrituras. Prueba concurrente contra pérdida de pedidos.
- CI, Dockerfile de backend, prueba PostgreSQL aislada y comando de verificación de producción sin cargos ni escrituras.

## Evidencia local

| Comprobación | Resultado |
|---|---|
| ESLint | Pasa, sin advertencias |
| TypeScript frontend y backend | Pasa |
| Pruebas frontend | 7 pasan |
| Pruebas backend | 31 pasan |
| Playwright sobre builds compilados | 19 recorridos pasan |
| PostgreSQL temporal | Migraciones 001–005 y verificaciones transaccionales pasan |
| Auditoría npm de dependencias de producción | 0 vulnerabilidades frontend y backend |
| Build frontend | Generado; PWA precarga 29 recursos |
| Build backend | Generado |
| Detector visual de los componentes revisados | Sin hallazgos mecánicos; no equivale a una auditoría completa de accesibilidad |

Las pruebas de navegador incluyen tarjeta **simulada**, KDS hasta entrega, roles, cierre de caja, compras/merma, descuentos, devolución, recuperación sin SSE, recarga del cobro, rechazo HTTP sin venta offline, edición/subida de imagen, cancelación por propietario, compra fallida sin efectos parciales, PWA offline y capturas de escritorio, iPad y móvil. Las pruebas de pagos unitarias utilizan respuestas simuladas del proveedor. No prueban disponibilidad de una terminal física.

PostgreSQL se inicia en un clúster temporal privado y se elimina al terminar. Las pruebas comprueban confirmación e inventario exactamente una vez, reserva idempotente, protección del stock reservado, liberación al pagar/cancelar, aprobación tardía después de devolución y atomicidad de compras en efectivo. No usan la base del negocio.

## Para completar la validación real

1. Configura los secretos en el servidor: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` y `POINT_DEVICE_ID`.
2. Conserva secretos JWT independientes, hash de administrador y clave de registro; usa `ENABLE_PAYMENT_SIMULATION=false` y orígenes HTTPS exactos en `ALLOWED_ORIGINS`.
3. Respalda la base y aplica 001–005 en orden. El servidor exige esquema versión 5 y falla al arrancar si no está listo.
4. Configura `VITE_API_URL` con la URL HTTPS final del backend, o proporciona un proxy del mismo origen para `/api`.
5. Ejecuta `npm --prefix backend run check:production`. Debe confirmar esquema y vinculación de la terminal mediante lecturas reales.
6. Publica el backend y el frontend en sus destinos y verifica `/ready`. Configura el webhook HTTPS `/api/webhooks/mercadopago` en el tópico Order.
7. En el equipo físico, verifica Point y realiza un cobro mínimo autorizado. Comprueba comprobante, referencia, importe, webhook, estado pagado, inventario y registro financiero. Verifica también cancelación y devolución autorizada.
8. Instala la PWA en el iPad real, prueba pérdida/recuperación de red y realiza un cierre con conteo físico. La emulación de navegador no sustituye esta prueba del hardware.

El comando `check:production` falla actualmente de forma explícita por ausencia de la configuración anterior; no hay fallback a simulación en producción. El contenedor está definido, pero no se construyó localmente porque el daemon Docker no está disponible.

## Referencias de integración

Las referencias estables e idempotency keys siguen la [Orders API de Mercado Pago Point](https://www.mercadopago.com.mx/developers/es/reference/in-person-payments/point/orders/create-order/post). Una respuesta HTTP 202 al cancelar representa una solicitud pendiente, no la cancelación final: [procesamiento de pagos Point](https://www.mercadopago.com.mx/developers/es/docs/mp-point/payment-processing).
