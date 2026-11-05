# Plan de catálogo y continuidad — ROFÉ

5 de noviembre de 2026. Rama local: `codex/rofe-development`. Este documento planifica el trabajo posterior al commit del diagnóstico aprobado; no representa imágenes generadas ni un arreglo ya verificado de apertura de caja.

## Orden de ejecución

1. **Corregir y demostrar la apertura de caja.** Conservar el JSON actual y reproducir en una copia aislada, con las mismas denominaciones y estado inicial; rastrear el request ID `de7eb27d-8b7a-4059-b7b8-92729f12f121`. El identificador no apareció en los logs disponibles al preparar este plan; no atribuirle una causa sin reproducción. Recorrer formulario → `POST /api/admin/cash/session/open` → Zod/denominaciones → `DbAdapter.openCashSession` → JSON, comparando contrato con la función SQL `open_cash_session`. Verificar autenticación, caja abierta/cerrada, campos heredados, persistencia y reintento/concurrencia. Agregar regresión con el caso real, logs con contexto seguro y respuesta útil sin mostrar datos internos. No borrar ni sustituir datos para hacer pasar el flujo.
2. **Sustituir las 12 fotografías** con el proceso siguiente, sin cambios a precios, recetas ni datos remotos.
3. **Integrar personalizaciones de extremo a extremo**, con administración como fuente de verdad, después de resolver las dos prioridades anteriores.

Los E2E actuales con fixtures nuevos comprueban sus recorridos, pero no demuestran que el error reportado en los datos del usuario esté corregido.

## Inventario de partida y entregables

El manifiesto versionado contiene 12 productos: 8 fotografías provisionales y 4 ilustraciones de marca por falta de fotografía adecuada. La semilla local sólo contiene 8 productos: producir las 12 imágenes no implica crear productos ni alterar el catálogo de producción.

| ID del producto | Estado anterior | Original nuevo que se entregará |
|---|---|---|
| `espresso` | Provisional; estilo antiguo | `espresso.png`: espresso individual con crema en taza pequeña |
| `double-espresso` | Pendiente; sin foto propia | `double-espresso.png`: doble espresso claramente diferenciado |
| `americano` | Provisional; estilo antiguo | `americano.png`: americano oscuro en vaso/taza de vidrio |
| `latte` | Pendiente; la antigua correspondía a iced latte | `latte.png`: latte caliente con microespuma y rosetta |
| `flat-white` | Pendiente; referencia externa antigua | `flat-white.png`: taza baja pequeña y microespuma fina |
| `matcha-latte` | Provisional; estilo antiguo | `matcha-latte.png`: matcha caliente, sin café |
| `cold-brew` | Provisional; fondo oscuro con persona/mano | `cold-brew.png`: café frío ámbar con hielo, sin leche |
| `iced-latte` | Provisional; estilo antiguo | `iced-latte.png`: espresso y leche fría con hielo |
| `iced-matcha-latte` | Provisional; fondo oscuro | `iced-matcha-latte.png`: matcha y leche fría con hielo, sin café |
| `croissant-mantequilla` | Pendiente; no reutilizar pain au chocolat | `croissant-mantequilla.png`: croissant de mantequilla, sin chocolate |
| `pain-au-chocolat` | Provisional; recorte de foto antigua | `pain-au-chocolat.png`: pieza laminada con barras de chocolate visibles |
| `galleta-chocolate` | Provisional; estilo antiguo | `galleta-chocolate.png`: galleta con trozos de chocolate |

La representación debe corresponder a la presentación real servida. Se comprobarán vajilla, cantidad de piezas, tamaño y accesorios con el catálogo/administración antes de producir la colección; una foto no debe prometer ingredientes o una porción distinta. Los prompts actuales de `scripts/product-images/sources.json` son la base, sujetos a esa revisión (por ejemplo, el prompt de galletas actualmente muestra dos piezas).

## Dirección fotográfica y generación real

Se seguirá la guía `imagegen` con la herramienta nativa de generación disponible en esta sesión; no requiere copiar claves al frontend ni asumir una cuenta externa. La capacidad disponible no significa que ya se hayan generado imágenes: **en esta etapa de organización y planificación no se generó ninguna**. Si una llamada futura falla, se documentará el fallo; no se marcará el producto como aprobado ni se sustituirá por una imagen ajena.

- Fotografías independientes, cuadradas, mínimo 1024 × 1024; preferencia 2048 × 2048 si la herramienta lo entrega.
- Producto centrado, ocupación aproximada del 60 %, encuadre tres cuartos, altura de cámara y perspectiva coherentes.
- Fondo y superficie cálidos beige/crema; luz difusa lateral, sombra suave, blancos y exposición uniformes.
- Texturas reales de crema, microespuma, vidrio, hielo y laminado; contraste suficiente con las superficies oliva del sitio.
- Sin texto, logotipos ajenos, marcas de agua, manos, personas ni decoraciones que confundan ingredientes.

Proceso: producir primero una referencia de bebida caliente, una fría y una de panadería; inspeccionarlas juntas, fijar la referencia de estilo y después generar el resto. Cada producto tendrá un archivo propio. Revisar identidad, anatomía, porción, balance de blancos, escala y nitidez; regenerar las piezas que no encajen. Mostrar evidencia comparativa antes/después con imágenes realmente creadas.

## Importación y rendimiento

1. Guardar los 12 originales seleccionados en el workspace y registrar proveedor/herramienta, prompt, fecha e identidad del producto. Conservar las fotos anteriores como referencia en Git, sin borrar originales del dueño.
2. Preparar un entorno Python aislado con Pillow (no está disponible en el Python probado de esta Mac). No modificar el Python del sistema.
3. Revisar que la carpeta de importación contenga exactamente los 12 IDs correctos y las imágenes cumplan dimensión/proporción. El importador actual puede aprobar parcialmente antes de devolver error: validar todo el lote antes de invocarlo.
4. Ejecutar `python3 scripts/product-images/import.py <carpeta-validada>`. El sistema copia originales a `scripts/product-images/originals/`, actualiza `sources.json` y genera `src/kiosk/productImages.json` con `approvedAt`.
5. Conservar el formato actual **WebP calidad 80** y variantes **384/640 px para tarjetas y 960 px para detalle**, sin ampliar fuentes pequeñas; nombres `<id>-<tamaño>.<hash>.webp`. Objetivos actuales: <80 KB en tarjetas y <140 KB en detalle; ajustar cada original si no cumple. No introducir AVIF sin medir la ganancia y la decodificación en M10.
6. Mantener las URLs con hash, caché inmutable y caché de fotos del service worker. El build elimina derivados obsoletos dentro de `public/products/`: revisar el diff y conservar la posibilidad de revertir por Git. No ejecutar el proceso sobre una carpeta de datos del usuario.

La precedencia existente es colección aprobada → subida administrativa posterior → provisional → ilustración. Se respetarán las fotos nuevas aportadas desde administración y se verificará el comportamiento de timestamps de las subidas locales; la actualización no escribirá rutas de imagen en Supabase.

## Integración en las cuatro superficies

- **POS y kiosco:** `Catalog` ya utiliza `productPhoto`; conservar encuadre, resolución seleccionada y fallback de marca.
- **Modal:** utiliza el mismo resolutor para la fotografía de detalle cuando la vista la muestra; confirmar que la imagen corresponda al producto y la selección no cambie al rotar.
- **QR:** `PickupPage` usa `product.image` directamente y un hero `/espresso.webp`. Debe adoptar el mismo resolutor/manifiesto para tarjetas y hero, y permitir la foto en su modal. Sustituir los assets del manifiesto por sí solo no actualiza esta superficie.
- **Administración:** conservar las subidas y la revisión de imágenes; mostrar qué fotografía será efectiva para el cliente, sin presentar como aprobadas las que no lo estén.

La precarga existente descarga y decodifica durante la bienvenida: orden del catálogo, 4 fotos prioritarias en vertical y 8 en horizontal, concurrencia 3, detalle después. Mantener las mismas URLs entre preloader e imágenes para evitar peticiones duplicadas. Medir el lote final, no extrapolar las cifras de las fotos provisionales.

## Criterios de aceptación

1. 12/12 entradas aprobadas con fotografías correctas y distintas; cero `interim`/`pending` para esos IDs, siempre que los originales hayan pasado revisión.
2. Todos los derivados responden 200 e `image/webp`; cero 404, solicitudes a Unsplash u otros hosts no permitidos y cero imagen equivocada al fallar una descarga.
3. Pruebas del resolutor: aprobación, subida administrativa posterior, fallback y fuente única en POS/kiosco/QR/modal.
4. Capturas comparables de POS, kiosco horizontal/vertical, QR móvil y modal; imágenes legibles sin deformación ni recorte de la parte identificadora del producto.
5. Prueba de arranque frío y caliente, red limitada a 8 Mbps/60 ms y modo offline PWA. En red controlada, fotos de primera pantalla descargadas/decodificadas durante la bienvenida y listas al tocar «ORDENAR AQUÍ»; bajo red arbitraria, fallback estable y carga progresiva sin bloquear el pedido.
6. Lint, typecheck, pruebas unitarias, E2E, build y validación PWA después de integrar. Android físico seguirá siendo una validación separada.
7. Informe final con antes/después por ID, originales realmente generados, tamaños/hash, capturas, resultados, rama/commit y limitaciones. Todo local, sin push, despliegue ni cambios a producción.

## Trabajo posterior: personalizaciones funcionales

Se auditarán tamaños, leche, hielo, intensidad/shots, temperatura y endulzantes por producto. El modelo administrable deberá ligar cada opción a ingredientes/unidades, cantidades o sustituciones, costo, ajuste de precio y límites; el backend cotizará y comprobará compatibilidad/stock sin confiar en importes del cliente. El pedido conservará una instantánea de las opciones y la receta efectiva para ticket/barista, reservas, consumo y devoluciones coherentes.

Splenda se contará por sobres individuales con cantidad mínima/máxima configurable. Azúcar usará «Poco», «Normal» y «Mucho», con equivalencias en gramos configurables. No se inventarán gramos, límites, precios ni recetas: se reutilizarán los existentes; los faltantes deberán quedar pendientes de configuración/revisión administrativa antes de habilitar esas opciones. No se mostrará leche en un espresso ni hielo en panadería, por ejemplo.

La aceptación incluirá personalizar → cotizar → cobrar → preparar → entregar, verificar consumos/costos/precio/instrucciones y disponibilidad en administración, POS, kiosco y QR, más reintentos, concurrencia, cancelación y devolución sin reservas ni consumos duplicados. Esto se implementará después de resolver caja y fotografías, según la prioridad indicada por el dueño.
