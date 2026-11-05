# ROFÉ · diseño del pickup por QR

## Overview

`/pedir` y sus subrutas abren el menú público sin cuenta ni autorización de dispositivo. La extensión conserva la identidad de [DESIGN.md](../DESIGN.md); este documento describe esta superficie, sin cambiar el sistema global. El recorrido es explorar, personalizar, revisar el punto de recogida, pagar en Stripe Checkout y conservar el comprobante privado. La configuración operativa está en [QR_PICKUP.md](QR_PICKUP.md).

## Colors

El fondo oliva oscuro (`#111311`), el panel de carrito (`#191c18`), la crema del texto (`#f4f0e5`) y el dorado de acciones (`#dec997`) continúan el POS. El texto secundario (`#bbb9ac`) y divisores (`#34392f`) separan información sin competir con nombres, importes o acciones. El estado «Listo» añade verde; avisos y errores siempre incluyen una explicación escrita. El letrero invierte la superficie: crema con texto oscuro y QR negro sobre blanco.

## Typography

Bricolage Grotesque presenta marca, invitación, nombres de productos y encabezados; Outfit mantiene lectura, formularios y controles. Ambas se sirven desde `/fonts` con licencias OFL. El título inicial usa peso 600 y `clamp(38px, 4vw, 58px)` en escritorio. Los nombres de producto usan 21 px, pasan a 20 px en móvil y permiten partir cadenas largas. Los campos usan 16 px; los importes, cifras tabulares. Las descripciones usan 14 px en escritorio y 13 px en móvil.

## Layout

El contenedor llega a 1280 px. En escritorio tiene márgenes internos de 48 px y dos columnas: menú flexible y carrito de 342 px, con separación de 48 px. El carrito permanece visible con posición sticky a 28 px del borde superior. A 1050 px se reducen márgenes y separación a 28 px, y el carrito a 320 px.

A 800 px o menos, el menú ocupa una columna y el carrito se convierte en una pantalla completa con regreso a «Seguir eligiendo». La barra fija inferior muestra cantidad, total y «Ver mi pedido» cuando hay productos; respeta el área segura del dispositivo. El contenido reserva espacio inferior para esa barra. Las categorías se desplazan horizontalmente. Los productos se presentan como filas, con texto a la izquierda y fotografía a la derecha, sin heredar la cuadrícula de dos productos del POS.

Las miniaturas tienen un marco de 124 × 124 px en escritorio, 108 × 108 px en móvil y 92 × 108 px a 360 px o menos. `object-fit: cover` conserva el marco; mínimos de tamaño cero impiden que la dimensión intrínseca de la foto expanda la fila. El hero reutiliza `/espresso.webp` y el catálogo usa las imágenes reales del producto. El comprobante tiene un ancho máximo de 640 px.

## Elevation & Depth

La superficie se organiza con diferencias de tono y divisores. El carrito utiliza un panel más claro; no añade una nueva sombra propia. La personalización reutiliza el diálogo existente del POS; en móvil se apoya en el borde inferior y ocupa hasta el 92 % de la altura dinámica disponible.

## Shapes

Hero y carrito de escritorio tienen esquinas de 16 px; miniaturas, 12 px; campos, categorías y acciones principales, 8 px. El indicador de agregar es circular, pero la fila completa es el botón del producto. Las acciones principales miden al menos 52 px de alto y la acción inferior móvil, 56 px. Categorías y controles de cantidad conservan 44 px de alto.

## Components

- **Menú:** búsqueda por nombre y descripción sin distinguir acentos, categorías con selección comunicada mediante `aria-pressed`, carga, reintento y resultado vacío con regreso al catálogo completo. Los agotados se deshabilitan y muestran «Agotado»; la falta de imagen usa un icono de café.
- **Personalización y carrito:** reutilizan `ProductModal` y resumen de modificadores. El carrito muestra cantidades, nombre, nota opcional, lugar de recogida y total en MXN. Un intento de pago pendiente bloquea cambios y permite continuar o consultar/cancelar ese intento.
- **Pago y pausa:** la tarjeta se captura en la página alojada de Stripe. Espera, error, cambio de importe y falta de almacenamiento tienen mensajes propios. Con pedidos pausados se puede explorar y formar el carrito; junto al botón deshabilitado se explica que se puede pedir en barra y que el carrito queda guardado. Pausar nuevos pedidos conserva la recuperación de intentos ya iniciados.
- **Comprobante:** presenta folio, nombre, ubicación, productos y total confirmado por servidor. Los estados pagados avanzan por «Recibido», «En preparación», «Listo» y «Entregado»; pendiente, cancelado y devuelto tienen textos y acciones distintos. Consulta cada cinco segundos mientras el pedido sigue activo; los errores recuperables reintentan a los diez segundos. Volver desde Stripe no prueba un pago. La recuperación depende de la clave privada conservada por el navegador, no de conocer el folio.
- **Acceso y movimiento:** hay salto al contenido, etiquetas, avisos accesibles y foco en el encabezado al cambiar de pantalla. La preferencia de movimiento reducido elimina el desplazamiento suave de esta página.
- **Operador:** Administración → Pedidos QR configura recogida y aceptación, muestra credenciales/dominio/modo y permite consultar la cuenta Stripe. No pide claves al cliente. La barra identifica pedidos pagados con «Pickup · QR», folio y stand, dentro del flujo existente de preparación y entrega.
- **Stand:** el identificador añade `?stand=…` a la misma URL de menú. El panel ofrece QR SVG y letrero SVG de 780 × 1100, con Bricolage Grotesque en pesos 700/600 y Outfit 400 incrustados, más sus licencias OFL en metadatos. En localhost informa que es vista previa; el letrero descargado lleva «VISTA PREVIA LOCAL · Configura el dominio antes de imprimir». El panel de configuración pasa de dos columnas a una a 1100 px.

## Do's and Don'ts

- Conservar la identidad y la personalización existentes al extender esta ruta.
- Mantener legibles el lugar de recogida, el importe y el siguiente paso en menú, carrito y comprobante.
- Mantener el marco de las fotografías y las fuentes incrustadas al exportar el letrero.
- Mostrar el motivo junto a una acción de pago deshabilitada; no depender sólo de su color.
- No presentar localhost ni pruebas simuladas como un QR público o un cobro real. El alcance actual es local, sin claves Stripe cargadas; dominio HTTPS, credenciales y prueba real siguen el procedimiento operativo.

Referencias visuales de la revisión: `.impeccable/review/pickup-mobile.png`, `pickup-desktop.png`, `pickup-cart-mobile.png`, `pickup-cart-paused-mobile.png`, `pickup-receipt-mobile.png` y `pickup-admin-desktop.png`. La revisión incorporó los ajustes de tamaño de fotos, tipografía de impresión y explicación del carrito pausado.
