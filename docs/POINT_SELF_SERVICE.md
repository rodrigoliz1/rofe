# Point Smart 2: SELF_SERVICE y recuperación a PDV

El cambio se hace por API de Mercado Pago, únicamente sobre `POINT_DEVICE_ID`.
No reasigna la cuenta, sucursal ni caja, no cambia credenciales y no crea cobros.
No hay una ruta web nueva para cambiar modos: la utilidad requiere acceso al
entorno privado del operador.

## Estado de ROFÉ

El 5-nov-2026 se consultó `GET /terminals/v1/list`: una terminal, idéntica al ID
configurado, en PDV. No había cobros Point pendientes registrados en ROFÉ.
Se envió **un solo PATCH** a `/terminals/v1/setup` con un elemento en `terminals`
y únicamente los campos `id` y `operating_mode: SELF_SERVICE`.

Mercado Pago respondió HTTP 200 con la terminal/modo esperados. La consulta
inmediata aún devolvía PDV; se hizo otra consulta GET, **sin repetir PATCH**, y
confirmó SELF_SERVICE. Sucursal/caja/vinculación permanecieron idénticas y no se
modificó ninguna otra terminal. Evidencia privada: `.rofe-local/evidence/point-self-service/`.
El identificador real y los secretos no se incluyen en esta guía pública.

Se solicitó reiniciar físicamente el Point cuando no tenga un cobro en curso.
Confirmar en la terminal su conexión Wi-Fi y pantalla de cobro. La API no prueba
por sí sola que ya se haya reiniciado el equipo.

## Inspección sin cambios

Desde una Mac autorizada con el `backend/.env` privado existente:

```sh
npm --prefix backend run point:mode
```

Muestra ID y modo, nunca el Access Token. No toma credenciales de la interfaz
web ni modifica archivos `.env`. No ejecutar `check:production` con el perfil de
desarrollo como si validara las variables de Vercel: ese perfil puede conservar
simulación/orígenes locales y omitir el secreto de webhook. El servidor publicado
valida su propia configuración; la utilidad consulta Point con la credencial privada.

## Regresar temporalmente a PDV

1. Esperar que no haya cobros en curso. Inspeccionar con el comando anterior.
2. Sustituir `ID_OBTENIDO_EN_LA_CONSULTA` por el ID exacto mostrado. La utilidad
   rechaza un ID diferente a `POINT_DEVICE_ID` y bloquea el cambio si ROFÉ registra
   un cobro Point pendiente o no puede comprobarlo.
3. Ejecutar:

```sh
npm --prefix backend run point:mode -- --apply --mode PDV --expected-mode SELF_SERVICE --terminal-id ID_OBTENIDO_EN_LA_CONSULTA
```

4. Confirmar HTTP 200 y volver a consultar el modo. Reiniciar físicamente el Point.
5. Realizar los ajustes de red/configuración necesarios desde la terminal.
6. Regresar a autoservicio:

```sh
npm --prefix backend run point:mode -- --apply --mode SELF_SERVICE --expected-mode PDV --terminal-id ID_OBTENIDO_EN_LA_CONSULTA
```

7. Consultar y reiniciar nuevamente. No cerrar sesión, desvincular, reasociar la
   terminal ni restablecerla para cambiar de modo.

La utilidad no reintenta PATCH automáticamente. Si `transitionPending=true`,
Mercado Pago aceptó el cambio pero su listado aún no se actualizó: consultar de
nuevo y completar el reinicio; no interpretar esa demora como un rechazo. Ante un
error/timeout, inspeccionar el modo antes de repetir cualquier cambio. Si ya está
en el modo solicitado, la utilidad no envía otro PATCH.

## Compatibilidad y alcance de la validación

ROFÉ ya acepta PDV y SELF_SERVICE en `MercadoPagoService.checkTerminal()`.
El envío sigue usando Orders API, el mismo `terminal_id`, importe y clave de
idempotencia; `processing_mode` se omite y el proveedor usa `automatic`.
`seller_ticket` es válido en ambos modos. No se cambió el flujo de pagos.

Pruebas con proveedor simulado comprueban el payload del PATCH (un solo ID),
reintentos sin mutación, regreso a PDV, propagación demorada, respuesta incorrecta
y conservación del envío automático/idempotencia. Las consultas reales verifican
credencial, identidad, vinculación y modo. **No se generó un cobro real de prueba.**
La comprobación física de cobro/webhook/comprobante requiere una operación normal
o un producto e importe autorizados por el dueño; no se declara completada por
estas consultas.

Fuentes oficiales consultadas el 5-nov-2026:

- [Configurar terminal](https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-terminal): SELF_SERVICE bloquea las funciones manuales, incluida la configuración Wi-Fi; se usa PDV temporalmente para administrarla y se reinicia tras el cambio.
- [Procesamiento de pagos](https://www.mercadopago.com.mx/developers/es/docs/mp-point/payment-processing): ambos modos permiten pagos integrados; procesamiento automático por defecto y opciones de impresión admitidas.
