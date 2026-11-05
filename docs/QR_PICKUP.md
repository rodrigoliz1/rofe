# ROFÉ · pedidos por QR para pickup

El stand invita con «PIDE TU CAFÉ AQUÍ». El QR abre `/pedir?stand=entrada-01`. El cliente elige y personaliza desde su celular, revisa dónde recogerá, indica su nombre y paga con tarjeta en Stripe Checkout. Vuelve a un comprobante privado con folio `Q-…`, nombre, detalle y seguimiento: recibido, en preparación, listo y entregado. El cliente no necesita cuenta ni autorización de terminal.

## Activar con una cuenta Stripe de pruebas

El entorno de trabajo actual permanece en `http://localhost:5173/pedir`. `backend/.env` ya contiene ese origen y los espacios vacíos para ambas claves. No hay credenciales Stripe cargadas. El menú se puede recorrer y el admin descarga vistas previas locales; el cobro se habilita después de añadir las claves y reiniciar el backend. Los QR de localhost sólo sirven en el mismo equipo, no dirigen el teléfono de un cliente al servidor de desarrollo.

1. Aplica las migraciones 001–005 a Supabase. La 005 añade canal/proveedor, metadatos privados del pickup y configuración de recogida. Las políticas bloquean el acceso directo de clientes a estas tablas.
2. En `backend/.env`, configura `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…` y `PUBLIC_ORDERING_URL=https://tu-dominio.mx`. El origen no lleva `/pedir` ni una ruta. Añade ese mismo origen a `ALLOWED_ORIGINS`.
3. En el frontend desplegado, `VITE_API_URL` debe apuntar al backend HTTPS. En desarrollo Vite dirige `/api` al backend local.
4. Configura un destino de eventos Stripe en `https://tu-api.mx/api/webhooks/stripe` para `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded` y `refund.updated`. Copia su secreto de firma al backend. Para pruebas locales, usa `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; el secreto de la CLI es distinto al del Dashboard.
5. Reinicia el backend. Ejecuta `npm --prefix backend run check:pickup` para una consulta de cuenta sin cobrar.
6. En Administración → Pedidos QR, configura nombre, dirección/referencia e instrucciones. Activa «Aceptar nuevos pedidos» y guarda. «Verificar cuenta Stripe» realiza una consulta real, sin cargos. Configurado y verificado son estados distintos.
7. Abre `/pedir` en el dominio público. Realiza una compra usando una tarjeta de pruebas de Stripe. Comprueba la confirmación del webhook, el folio en el KDS, el descuento de inventario, una sola entrada contable y el estado «Listo» en el celular.
8. Asigna un identificador a cada stand, por ejemplo `entrada-01` o `terraza-02`. Descarga el QR o el letrero SVG y prueba el escaneo desde el soporte impreso antes de distribuirlo.

No se necesita `STRIPE_PUBLISHABLE_KEY`: la captura de tarjeta ocurre en la página alojada de Stripe. Las claves secretas permanecen en el backend y nunca llevan prefijo `VITE_`. Cuando las credenciales o el dominio faltan, el cliente puede consultar el menú; la UI comunica que los pedidos están pausados y no inventa cobros.

## Operación y recuperación

- El servidor recalcula productos y modificadores; ignora importes aportados por el cliente. Hasta 20 productos y 12 combinaciones por compra, por un total de hasta $10,000 MXN.
- Antes de abrir Stripe se guarda el pedido con un `operationId` estable y se reservan los insumos. Un retry conserva referencias, total, vencimiento y clave de idempotencia de Stripe. La sesión tiene una ventana de 35 minutos.
- El retorno desde Stripe no acredita una venta. Webhook y consulta de estado verifican sesión, referencia, MXN y total; la confirmación transaccional consume inventario y registra ingresos una sola vez.
- El comprobante usa una clave aleatoria de 256 bits; la base guarda sólo su hash. La clave viaja por cabecera y, en el regreso del proveedor, por fragmento de URL que se elimina al recuperar el comprobante. Las respuestas públicas omiten recetas, costos y claves internas.
- El navegador conserva carrito e intento antes de pagar. Si se pierde la respuesta, «Continuar pago» recupera el mismo checkout. El pago pendiente bloquea cambios al carrito. Un navegador sin almacenamiento debe habilitarlo antes de pagar.
- Cancelar exige que Stripe confirme la expiración de la sesión. Si el pago ganó la carrera, se muestra la venta pagada y se utiliza la devolución administrativa. Una salida de la pantalla de Stripe sólo deja el intento pendiente.
- Una tarea del servidor reconcilia pedidos pendientes cada minuto y libera reservas al confirmarse la expiración. Si se perdió la respuesta de creación, busca la sesión por referencia antes de liberar. Un backend sin conexión al proveedor conserva el estado pendiente.
- Los pedidos QR pagados aparecen en KDS con «Pickup · QR» y el folio `Q-…`. Usan las mismas transiciones, movimientos, ventas y reportes. Pausar nuevos pedidos no impide consultar o completar los ya iniciados.
- Las devoluciones administrativas se dirigen al proveedor original. Una devolución pendiente de Stripe no se marca como finalizada. El webhook concilia devoluciones completas; las parciales requieren gestión operativa y no se presentan como devolución total.
- Los pedidos por QR requieren conexión. La outbox de efectivo del POS no se utiliza para pagos web.

## Evidencia y alcance

Las pruebas de backend ejercitan almacenamiento JSON aislado y el SDK de Stripe con transporte simulado: precios, propiedad de comprobantes, sesión idempotente, replays, monedas/importes incorrectos, firma original, cancelación y confirmación única. Playwright recorre el menú real, checkout/retorno simulados, recuperación tras recarga, estado listo y descarga del letrero. PostgreSQL verifica el pago QR con el mismo ledger y reserva.

La cuenta Stripe, el dominio HTTPS y la entrega real de eventos requieren configuración del titular. Ninguna prueba simulada acredita un cobro real. Este trabajo no crea cuentas, no activa cargos ni publica datos de tarjeta.

Documentación utilizada: [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [confirmación de pedidos](https://docs.stripe.com/checkout/fulfillment), [webhooks firmados](https://docs.stripe.com/events/manage-webhook-endpoints) y [reservas e inventario](https://docs.stripe.com/payments/checkout/managing-limited-inventory).
