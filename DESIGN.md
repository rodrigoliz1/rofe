# Sistema visual de ROFÉ

Modo de las superficies: Operate. Prioridad: tomar pedidos y operar un turno con controles legibles, estables y accesibles al tacto.

La identidad conserva el nombre ROFÉ y la combinación Bricolage Grotesque / Outfit. Las fuentes se sirven desde `/fonts`, con sus licencias OFL, para que la operación offline no dependa de Google Fonts.

Las superficies oscuras tienen un matiz oliva: fondo `#111311`, panel `#191c18`, controles `#232720`. Texto principal `#f4f0e5`, secundario `#bbb9ac`, atenuado `#a19f92`. El acento cálido `#dec997` identifica acciones principales. Estado positivo `#a9ce9a`, error `#ffaaa0`, pendiente `#e6c67f`. Los estados también se expresan con texto.

En escritorio, catálogo y pedido ocupan columnas independientes. En iPad vertical, catálogo y pedido tienen áreas de desplazamiento propias. En teléfonos, la página permite desplazamiento vertical y mantiene dos productos por fila. Categorías se desplazan horizontalmente. Los nombres de productos pueden ocupar varias líneas.

Controles principales tienen al menos 44 px de altura. Formularios utilizan texto de 16 px, foco visible, etiquetas y estados de espera/error. Los diálogos principales retienen el foco y lo devuelven al cerrar; un cobro pendiente necesita una cancelación explícita.

El CSS se organiza en `src/styles`: fundamentos y fuentes, POS, checkout, barra, operaciones, administración, reglas adaptables y ajustes compartidos de la aplicación. Los íconos de navegación son SVG consistentes en `UiIcon.tsx`.
