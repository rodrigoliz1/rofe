# Personalizaciones conectadas a receta e inventario

Administración es la fuente de verdad. Cada producto conserva la configuración en el JSON `custom_variants` existente; no se requiere una columna nueva ni una migración remota. Los grupos antiguos sin tipo de uso quedan pendientes de revisión: no se permite vender un endulzante no cuantificado como si no consumiera ingredientes.

## Configuración

El editor de productos permite:

- Grupos por elección o por conteo de unidades; estado borrador/habilitado y selección obligatoria.
- Azúcar: Poco, Normal y Mucho, con gramos de inventario explícitos y crecientes.
- Splenda: insumo contado por piezas/sobres, una pieza por sobre, mínimo/máximo y recargo por unidad.
- Leches: sustitución del insumo base por otro de la misma unidad, conservando la cantidad resultante del tamaño.
- Tamaños, hielo e intensidad: cambios explícitos de gramos/ml frente a la receta base.
- Temperatura e instrucciones sin cambios de ingredientes cuando corresponde.
- Precio de cada opción, costo estimado de la receta e instrucciones para barra.

Se validan insumos existentes, unidades, compatibilidad del producto y límites; no se ofrecen modificadores de bebidas en panadería ni shots en recetas sin café. Una receta sin ingredientes definidos no se vende como si tuviera disponibilidad ilimitada.

## Valores iniciales autorizados

Después de que el dueño delegó el criterio de cantidades, se preparó una política local revisable: Poco 2 g, Normal 4 g y Mucho 8 g; Splenda 0–2 sobres; endulzantes incluidos sin recargo inicial. La referencia culinaria es aproximadamente [4 g por cucharadita de azúcar](https://www.sugar.org/resources/sugar-fun-facts/faqs/); [Splenda Original indica dos cucharaditas de dulzor por sobre](https://www.splenda.com/product/splenda-sweetener-packets/). Son decisiones iniciales de servicio, no una recomendación médica ni una equivalencia universal para otras presentaciones de endulzante.

Se reutilizan precios anteriores del sistema (Grande +$12, leche vegetal +$15, shot +$15) como configuración inicial editable. El shot usa la dosis de café de la receta de Espresso existente. Grande aumenta 50% los ingredientes medidos de una bebida con líquido definido, sin prometer un volumen de vaso no documentado; Espresso/Americano sin líquido medido no reciben tamaños ficticios. La porción de hielo de Cold Brew se toma de la receta existente de Iced Latte; Poco hielo usa la mitad y Sin hielo lo retira. Temperatura permite instrucciones de preparación sin inventar consumos.

`scripts/configure-local-menu.mjs` muestra la propuesta; `--apply` sólo escribe `.rofe-local/db.json`, exige detener el servidor, verifica que el archivo no cambió y crea un backup previo. No usa credenciales ni accede a Supabase. Se aplicó al catálogo local, conservando pedidos, caja e historial. Azúcar y Splenda se crean en existencia/costo cero: deben abastecerse con una compra o ajuste real autorizado; no se inventaron inventarios para habilitar sus botones.

## Cotización, pedido y consumo

POS/kiosco usan `/api/orders/quote` autenticado y QR usa `/api/pickup/quote` público con rate limiting. El servidor valida las opciones y consulta stock disponible menos reservas; la cotización no revela costos internos. La creación del pedido vuelve a validar precios y receta. POS compara el subtotal cotizado para no aceptar silenciosamente cambios de precio.

Los pedidos guardan `quantitySelections`, `preparation`, `ingredientInstructions`, `recipeSnapshot` y `recipeCostSnapshot`. La receta efectiva se resuelve por tamaño y después sustitución de leche, evitando que una leche alternativa pierda el aumento de volumen. La confirmación de pago consume la instantánea una sola vez, aunque después se edite el producto. Las operaciones canceladas no consumen; las devoluciones siguen la liberación/restauración idempotente existente. Los pedidos anteriores conservan su lógica de consumo histórica.

La disponibilidad explora combinaciones configuradas: un producto puede prepararse con leche alternativa o sin hielo aunque el ingrediente de su receta base esté agotado. La búsqueda de menú está limitada para evitar abuso; si no termina, no afirma falsamente que está agotado y la cotización exacta sigue siendo obligatoria. Las cantidades se validan de nuevo al reservar/cobrar.

Ticket, carrito, comprobante QR y tarjetas de barra comparten las instrucciones resueltas, con gramos o sobres precisos. Sin red el carrito muestra que precio e ingredientes se verificarán al sincronizar; ningún pago con tarjeta se confirma offline.

## Evidencia

Pruebas de dominio: configuración, unidades, dosis, precios, sustitución de leche después de tamaño, costos, conflicto azúcar/Splenda, cantidades inválidas, reservas, disponibilidad combinada, recetas antiguas y confirmación repetida sin consumos duplicados.

`e2e/personalization.spec.ts` configura ingredientes/producto mediante Administración en la base temporal, personaliza dos sobres, cotiza, crea el pedido en kiosco, comprueba instrucciones en barra, cobra dos veces el mismo pedido, prepara y entrega. Verifica descuento exacto y un único movimiento por ingrediente; también comprueba azúcar por gramos y rechazo de cantidades no autorizadas en QR. Sus cantidades y costos son fixtures de prueba, no datos del negocio.

Capturas sin clientes reales: `docs/evidence/personalization-customer.png` y `personalization-barista.png`. Logs privados de pruebas y backup local: `.rofe-local/evidence/` y `.rofe-local/backups/`.
