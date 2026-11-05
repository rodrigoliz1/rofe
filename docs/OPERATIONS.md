# Operación diaria

## Apertura

1. Confirma que la terminal indique **En línea** y que `/ready` esté sano.
2. Inicia sesión como responsable y abre la caja con denominaciones contadas.
3. Revisa alertas de insumos y caducidades.
4. Haz una venta controlada si se actualizó Point, la red o el backend.

## Durante el turno

- Tarjeta rechazada: cierra el intento antes de iniciar un nuevo cobro. «Revisar envío» recupera la misma operación; no crea una referencia nueva.
- Recarga durante un cobro: ROFÉ recupera el intento. Espera la confirmación o solicita la cancelación; no repitas el pago en otra terminal.
- Cancelación solicitada: una aceptación de la solicitud no equivale a una cancelación confirmada.
- Point reserva los insumos del pedido. Finaliza o cancela el cobro antes de reducir esas existencias.
- Sin internet: sólo efectivo puede continuar en outbox. Confirma el indicador “por sincronizar” antes de cerrar.
- Compra: registra proveedor, cantidades y costo. Si pagas con efectivo de la caja, abre sesión y desglosa las denominaciones retiradas; compra, stock, movimiento y retiro se confirman juntos. El stock y costo promedio deben provenir del movimiento.
- Merma: registra cantidad, motivo y responsable; nunca edites el stock para ocultarla.
- Cancelación/devolución: exige razón y autorización; no borres la venta.

## Cierre

1. Espera a que la outbox esté en cero.
2. Termina o documenta pedidos pendientes.
3. Cuenta denominaciones físicamente, sin mirar primero el esperado.
4. Registra contado, esperado y diferencia.
5. Crea el cierre diario; no borres pedidos ni movimientos.
6. Investiga cualquier diferencia y conserva la auditoría.

## Escalamiento

- `SESSION_EXPIRED`: iniciar sesión otra vez.
- `PAYMENT_PROVIDER_ERROR`: revisar conexión y panel de Mercado Pago; no acreditar manualmente.
- `PAYMENT_AMOUNT_MISMATCH`: bloquear entrega y conciliar en Mercado Pago.
- `INVALID_DEVICE`: revisar si el dispositivo fue revocado.
- `SYNC FAILED`: mantener el dispositivo encendido, recuperar conexión y revisar logs por `requestId`.

## Verificar Point antes del primer turno

Entra a administración → Terminal Point. «Configurada» describe las variables del servidor; «Verificar conexión» consulta Mercado Pago y comprueba que la terminal pertenezca a la cuenta y esté en modo PDV o SELF_SERVICE. Después realiza un cobro mínimo autorizado desde el dispositivo físico y compara referencia, comprobante e importe. La prueba simulada no sustituye esta verificación.

## Pedidos sin sincronizar

Toca el indicador de conexión para ver el número pendiente y el último error. La cola conserva las operaciones fallidas; «Reintentar sincronización» habilita un nuevo intento. Un pedido inválido no bloquea a los demás. No borres los datos del navegador ni cambies de dispositivo mientras queden pedidos pendientes.
