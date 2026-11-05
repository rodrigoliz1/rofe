# Colección fotográfica entregada

Las doce imágenes se generaron de verdad mediante la herramienta nativa `image_gen.imagegen` el 5-nov-2026. Se verificaron visualmente como conjunto y no se reutilizó una fotografía para productos diferentes. Originales cuadrados de 1254 × 1254 px, sin textos, marcas de agua ni personas.

| Producto | Antes | Ahora |
|---|---|---|
| Espresso | Provisional | Foto nueva individual |
| Double Espresso | Ilustración | Foto nueva doble espresso |
| Americano | Provisional | Foto nueva, sin leche |
| Latte | Ilustración | Foto nueva caliente con rosetta |
| Flat White | Ilustración | Foto nueva en taza baja |
| Matcha Latte | Provisional | Foto nueva caliente, sin café |
| Cold Brew | Provisional con mano/fondo oscuro | Foto nueva de café negro con hielo |
| Iced Latte | Provisional | Foto nueva de leche y espresso con hielo |
| Iced Matcha Latte | Provisional oscura | Foto nueva de matcha y leche con hielo |
| Croissant de mantequilla | Ilustración | Foto nueva de croissant sin chocolate |
| Pain au Chocolat | Provisional | Foto nueva de pieza con chocolate |
| Galleta de chocolate | Provisional | Foto nueva de una pieza |

La semilla de desarrollo conserva sus ocho productos; no se añadieron productos artificialmente ni se editaron datos de producción. Las doce imágenes están disponibles por ID para todo el catálogo.

El importador existente produjo variantes 384/640/960 WebP de calidad 80 y nombres con hash. La tarjeta más grande de 640 px pesa aproximadamente 42 KB. `productImages.json` tiene doce aprobadas y cada archivo tiene hash propio; `provenance.json` conserva SHA-256 de los originales. Las fotos fuente previas se conservan y no se borraron imágenes del dueño.

La integración de QR antes usaba URLs directas: ahora sus tarjetas, hero y modal comparten el manifiesto de POS/kiosco. Administración muestra la imagen efectiva al editar. La precarga conserva concurrencia 3 y prioridad de primera pantalla, seguida de detalles. Las métricas y pruebas están en `.rofe-local/evidence/photo-e2e.log`; la tabla de aceptación se completa con las verificaciones de esta entrega. Evidencia visual pública sin datos de clientes: `docs/evidence/catalog-*`.
