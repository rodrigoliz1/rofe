# Cobro en efectivo y cupones de cambio

## Cobrar (barista)

1. En la cola, toca **COBRAR** en el pedido en efectivo.
2. Toca un **billete o moneda por cada pieza** que entregó el cliente. Cualquier parte del recuadro suma uno. En las denominaciones ya tocadas aparece **−** a un costado para quitar una. No se usa el teclado.
3. Arriba se ven **Total, Recibido y Cambio**, con los botones **Cobrar** y **Cerrar**. *Borrar conteo* reinicia.
4. **Cobrar** calcula el cambio exacto con lo que hay en caja más lo recién recibido.

## Cambio insuficiente en caja

Si no existe combinación para dar el cambio completo, aparece **«Cambio insuficiente en caja»**, con lo que la caja sí puede entregar y lo que falta. Pregunta al cliente:

- **Emitir cupón por $X**: se registra el pago y se entrega en efectivo lo que la caja puede dar. Por lo que falta se emite un **cupón de cambio** con **QR y código** (por ejemplo `N77D-Y8VM-40`). El cliente toma una foto.
- **Cancelar transacción**: el pedido se cancela sin cobrar nada; devuelve los billetes al cliente. El barista puede hacerlo solo en este caso: pedido en efectivo aún no cobrado.
- **Volver a contar**: por si el cliente prefiere pagar con otros billetes.

## Usar el cupón

- **En el siguiente pedido** (kiosco o POS): al pagar, *¿Tienes un cupón de cambio?* → escribir el código → **Aplicar**. Se descuenta hasta el saldo del cupón. Si lo cubre todo, el botón es **Confirmar pedido** y no hay cobro. Lo que no se use queda como saldo.
- **En barra (efectivo)**: Barista → **Cupones** → **Escanear QR** (cámara) o escribir el código → **Entregar $X en efectivo**. Se entrega el saldo completo, solo si la caja tiene las denominaciones exactas; si no, lo indica.

El código acepta minúsculas y no exige guiones; las letras O, I y L se interpretan como 0, 1 y 1.

## Garantías

- **Una sola vez**: el pago y la emisión del cupón son una única transacción. El uso en un pedido y el pago en efectivo llevan un identificador de operación, así que un doble toque o una reconexión no duplican nada.
- **Cancelaciones**: si se cancela un pedido que usó un cupón, el saldo vuelve al cupón una sola vez.
- **Caja**: el efectivo recibido queda en el cajón, así que el cupón pendiente está físicamente en la caja. Pagar un cupón en efectivo registra una salida (`voucher_payout`), y el corte de caja sigue cuadrando. Las pruebas lo verifican: 30 + 100 − 30 + 38 − 25 = 113, diferencia 0.
- **Seguridad**: los códigos tienen unos 50 bits aleatorios. Consultarlos exige sesión (terminal o personal) y tiene límite de intentos (30 fallos cada 15 min). Cada emisión, cancelación y pago queda en la auditoría.
- Un cupón no se combina con un descuento autorizado por gerente.

## Tratamiento contable (auditoría)

- **Un cupón es un pasivo, no un descuento.** Al emitirlo, ROFÉ debe ese dinero al cliente. Al usarlo, se paga parte del pedido: el pedido conserva su `total` (venta bruta completa) y `voucher_amount` guarda la parte liquidada con el cupón. `discount` no cambia.
- Lo que se cobra por Point o en efectivo, y lo que se devuelve en un reembolso, es `total − voucher_amount`. El reporte separa `voucherSettled`, lo liquidado con cupones.
- **Reembolso** de un pedido pagado en parte con cupón: se devuelve en efectivo solo la parte cobrada en efectivo, y el saldo vuelve al cupón, una sola vez. El movimiento de caja registra el efectivo que realmente sale del cajón; un reembolso con tarjeta registra $0 en caja.
- **Corte de caja**: `expectedCash` es solo efectivo físico. La respuesta añade `vouchers`, con lo emitido, lo pagado en efectivo, lo aplicado a pedidos, lo cancelado, el pasivo vigente y lo reservado en pedidos pendientes.
- **Tratamiento fiscal**: se recomienda que el contador confirme el tratamiento del cupón (anticipo o saldo a favor del cliente) y decida si debe tener vigencia. Hoy no caduca.

## Controles del backend (independientes de la pantalla)

- El backend vuelve a validar la cuenta: recibido − cambio − cupón = por cobrar, en centavos exactos.
- Solo emite un cupón por el cambio que realmente no se puede dar con lo que hay en el cajón más lo recibido (`bestPossibleChange`). Si sí se puede dar, responde `VOUCHER_NOT_NEEDED`.
- El pago en efectivo exige el saldo exacto y que las denominaciones estén en el cajón.
- Las funciones de Postgres bloquean la fila del cupón (`FOR UPDATE`). Las pruebas lanzan 12 usos en paralelo y solo uno gana.
- Las reservas huérfanas, cuyo pedido nunca se guardó, se liberan a los 10 minutos.
- La sincronización offline rechaza cupones (`OFFLINE_VOUCHER_NOT_ALLOWED`).
- **Permisos**: la terminal kiosco solo consulta y aplica cupones en su propio pedido. El cobro en efectivo y el pago de cupones son para el personal de caja. El historial y la cancelación son solo para ADMIN y MANAGER, y la cancelación exige un motivo y queda auditada. Un cupón reservado por un pedido pendiente no se puede cancelar.
- **Historial**: Admin → Finanzas → «Cupones de cambio».

## Despliegue

1. Aplica `backend/migrations/007_change_vouchers.sql` en Supabase (SQL Editor). Crea dos tablas y cuatro funciones; no modifica datos existentes.
2. Aplica `backend/migrations/008_voucher_ledger.sql`. Agrega `orders.voucher_amount`, los campos de cancelación y las funciones de cancelación y liberación, y corrige el monto del reembolso en caja. No borra datos.
3. Despliega. Sin la 007, los cupones responden «falta la migración». Sin la 008, se pueden emitir y pagar cupones en efectivo, pero usarlos en pedidos responde 503.
