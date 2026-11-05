# ROFÉ Espresso Bar

ROFÉ es un punto de venta para una cafetería móvil en México. El recorrido principal es elegir productos, personalizar, registrar el pedido y cobrar mediante Mercado Pago Point o efectivo en mostrador.

El POS funciona en dispositivos autorizados. Las cuentas de equipo permiten operar la barra/KDS; administración y gerencia gestionan catálogo, recetas, insumos, compras, mermas, producción, caja, reportes y cierres. Administración también controla usuarios y dispositivos.

La interfaz se usa durante turnos de trabajo, principalmente en iPad, con soporte para escritorio y teléfonos. Los importes están en MXN; la operación del servidor utiliza America/Mexico_City.

Un cobro con tarjeta sólo se considera pagado después de la confirmación del proveedor consultada desde el servidor. Una orden en efectivo sin red se conserva localmente y sigue pendiente de cobro. Los pedidos, sus movimientos y las correcciones conservan trazabilidad.

Producción requiere Supabase, configuración segura, origen HTTPS, terminal Point vinculada y webhook firmado. Una simulación prueba el recorrido de software y nunca acredita conectividad con una terminal real.

El canal público `/pedir` permite ordenar sin cuenta desde un QR de stand, personalizar, pagar con tarjeta en Stripe Checkout y consultar un comprobante privado para recoger en barra; sólo la confirmación del proveedor desde el servidor acredita el pago. Administración configura la recogida y genera los QR; la barra recibe los pedidos pagados con folio y stand. El alcance actual permanece en localhost, sin claves Stripe cargadas: permite recorrer el menú y preparar vistas previas, mientras los cobros y QR para clientes requieren credenciales, dominio HTTPS y validación real.
