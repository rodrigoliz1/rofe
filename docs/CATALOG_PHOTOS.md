# Catálogo fotográfico de ROFÉ

## Estado: **PENDIENTE — la nueva colección fotográfica no se ha generado**

No hay generación de imágenes legítima disponible en esta sesión:
- **Canva** (`generate-image`): desactivada por el administrador del equipo de Canva.
- **Figma** (`generate_image`): requiere crear archivos en tu cuenta y consume créditos de IA. Esa acción no estaba autorizada explícitamente y no la reintenté.
- No hay generadores locales ni modelos en el entorno.

**Ninguna foto del catálogo pertenece todavía a la colección nueva.** Las que se ven son fotos antiguas del repositorio, marcadas como *provisionales*. Están optimizadas y recortadas 1:1, pero siguen siendo las mismas imágenes. Los productos sin una foto correcta muestran la ilustración de marca, nunca una foto equivocada.

## Diagnóstico del error `espresso.png` (404) y de los productos sin imagen

- La base de producción se sembró desde una versión antigua de `src/App.tsx` con **12 productos**. Espresso y Double Espresso apuntan a `/espresso.png`, archivo que no existe en el proyecto (404). Latte, Flat White y Croissant apuntan a `images.unsplash.com`, un host externo que la APK bloquea por su lista blanca, así que aparecen sin imagen.
- Antes, `productPhoto()` trataba cualquier ruta de la base como "subida por el administrador" y le daba prioridad.
- **Corrección**: la precedencia es explícita (abajo). Las referencias antiguas de la base (`/espresso.png`, rutas del seed, URLs externas) ya no se solicitan nunca. Un E2E reproduce exactamente las filas de producción y verifica cero 404 y cero peticiones externas.

## Política de precedencia (`src/services/productImages.ts`)

1. **Aprobada** (colección nueva, `status: approved` + `approvedAt`): gana sobre la base de datos, salvo…
2. …una **foto subida desde Admin después de la aprobación**. Supabase Storage nombra los archivos con la fecha de subida. Una subida también gana sobre las provisionales y las pendientes.
3. **Provisional** (`interim`): foto antigua correcta para el producto, hasta que se apruebe la nueva.
4. **Pendiente** (`pending`): ilustración de marca.
5. Productos creados en Admin sin entrada en el manifiesto: solo archivos del mismo dominio.

El versionado y la invalidación de caché funcionan por nombre: cada archivo es `<id>-<px>.<sha256[:10]>.webp`. Una foto nueva tiene otro nombre, así que la caché HTTP inmutable, el service worker y la WebView la descargan sin limpiar nada.

## Inventario (12 productos de producción)

| ID | Producto | Estado | Fuente actual | Nota |
| --- | --- | --- | --- | --- |
| `espresso` | Espresso | 🟡 Provisional (foto antigua) | public/espresso.webp | Foto antigua del repositorio, correcta para el producto pero de estilo distinto: provisional hasta tener la nueva colección. |
| `double-espresso` | Double Espresso | ⛔ Pendiente (ilustración de marca) | — | Sin fotografía propia (no puede compartir la del Espresso). |
| `americano` | Americano | 🟡 Provisional (foto antigua) | public/americano.webp | Foto antigua del repositorio, correcta para el producto pero de estilo distinto: provisional hasta tener la nueva colección. |
| `latte` | Latte | ⛔ Pendiente (ilustración de marca) | — | No hay fotografía de un latte caliente: la anterior era la del iced latte. Se muestra la ilustración de marca hasta aprobar una foto. |
| `flat-white` | Flat White | ⛔ Pendiente (ilustración de marca) | — | Sin fotografía propia; la base de producción apuntaba a una imagen externa de Unsplash, bloqueada en la APK. |
| `matcha-latte` | Matcha latte | 🟡 Provisional (foto antigua) | public/matcha-latte.jpg | Foto antigua del repositorio, correcta para el producto pero de estilo distinto: provisional hasta tener la nueva colección. |
| `cold-brew` | Cold brew | 🟡 Provisional (foto antigua) | public/cold-brew.webp | Foto antigua provisional (fondo oscuro, aparecen mano y delantal): sustituir por la nueva colección. |
| `iced-latte` | Iced latte | 🟡 Provisional (foto antigua) | public/iced-latte.webp | Foto antigua del repositorio, correcta para el producto pero de estilo distinto: provisional hasta tener la nueva colección. |
| `iced-matcha-latte` | Iced Matcha Latte | 🟡 Provisional (foto antigua) | public/matcha-frio.jpg | Foto antigua provisional (fondo oscuro): sustituir por la nueva colección. |
| `croissant-mantequilla` | Croissant de mantequilla | ⛔ Pendiente (ilustración de marca) | — | La única foto disponible (pan-chocolate.jpg) muestra panes de chocolate, no un croissant de mantequilla. Se muestra la ilustración de marca hasta aprobar una foto. |
| `pain-au-chocolat` | Pain au Chocolat | 🟡 Provisional (foto antigua) | public/pan-chocolate.jpg | Recorte provisional de la foto antigua: sustituir por la nueva colección. |
| `galleta-chocolate` | Galleta de chocolate | 🟡 Provisional (foto antigua) | public/galleta-chispas.jpeg | Foto antigua del repositorio, correcta para el producto pero de estilo distinto: provisional hasta tener la nueva colección. |

Ninguna foto de tarjeta supera 80 KB (384/640 px) ni la de detalle 140 KB. Ningún producto comparte foto con otro, y todas responden HTTP 200 `image/webp` (lo verifican pruebas automáticas). Licencias: el repositorio no documenta el origen de las fotos antiguas; confírmalo antes de un uso comercial prolongado.

## Encargo para generar la colección nueva

**Dimensiones y formato de entrega**: 1:1, mínimo 1024×1024 px (ideal 2048), PNG/JPEG/WebP en sRGB, sin texto ni marcas de agua. El nombre de archivo es el id del producto: `espresso.png`, `flat-white.png`, etc.

**Dirección artística maestra** (antepón este texto a cada prompt):

> Hyperrealistic advertising product photograph for a premium espresso bar menu. Square 1:1 frame, product centered and filling about 60% of the frame, camera at a three-quarter angle slightly above the subject, same scale and perspective for every product. Soft diffused studio key light from the left, gentle fill, subtle soft shadow. Seamless warm neutral background in beige and cream with a soft gradient, matte light stone surface. Minimalist composition, realistic textures, appetizing. No text, no logos, no brands, no people, no faces, no hands, no props or decorations beyond what is described.

**Prompt por producto**:

| Producto | Descripción |
| --- | --- |
| Espresso (`espresso`) | A single espresso in a small white ceramic demitasse on a matching saucer, thick golden-hazelnut crema with fine tiger striping, nothing else on the surface. |
| Double Espresso (`double-espresso`) | A double espresso in a slightly larger white ceramic cup on a saucer, deep dark-brown coffee with a thick hazelnut crema, a visibly fuller cup than a single espresso, nothing else on the surface. |
| Americano (`americano`) | An americano in a clear double-walled glass mug, deep brown coffee with a thin light crema on top, visible transparency of the glass, nothing else on the surface. |
| Latte (`latte`) | A hot café latte in a wide cream-colored ceramic cup on a saucer, glossy microfoam with a symmetrical rosetta latte art, warm caramel-brown edges, light steam, nothing else on the surface. |
| Flat White (`flat-white`) | A flat white in a small 160 ml cream ceramic cup on a saucer, thin glossy microfoam with a small tulip latte art, rich coffee-brown edges, nothing else on the surface. |
| Matcha latte (`matcha-latte`) | A hot matcha latte in a white ceramic cup, vivid jade-green surface with white leaf latte art, velvety microfoam, nothing else on the surface. |
| Cold brew (`cold-brew`) | A cold brew coffee in a tall clear tumbler with large clear ice cubes, deep amber-mahogany color with light passing through, tiny condensation droplets on the glass, nothing else on the surface. |
| Iced latte (`iced-latte`) | An iced latte in a tall clear glass with ice cubes, milk and espresso gently layered from cream to caramel brown, a clear glass straw, light condensation, nothing else on the surface. |
| Iced Matcha Latte (`iced-matcha-latte`) | An iced matcha latte in a tall clear glass with clear ice cubes, vivid jade-green matcha floating over white milk with a soft gradient, light condensation, nothing else on the surface. |
| Croissant de mantequilla (`croissant-mantequilla`) | A single golden butter croissant with crisp flaky laminated layers and a glossy egg-washed crust, resting on a small cream ceramic plate, a few flakes of pastry on the surface. |
| Pain au Chocolat (`pain-au-chocolat`) | A single golden pain au chocolat with crisp laminated layers, two dark chocolate batons visible at the ends, on a small cream ceramic plate, nothing else on the surface. |
| Galleta de chocolate (`galleta-chocolate`) | Two soft-baked chocolate chip cookies stacked slightly offset, golden edges, melted dark chocolate chunks, a light dusting of flaky sea salt, on parchment over the stone surface. |

## Integración automática de las fotos generadas

1. Copia las fotos aprobadas, nombradas por id, a una carpeta (por ejemplo `~/rofe-fotos/`).
2. Ejecuta el importador:
   ```bash
   python3 scripts/product-images/import.py ~/rofe-fotos
   ```
   Verifica tamaño y proporción, copia los originales a `scripts/product-images/originals/`, marca cada producto como `approved` con la fecha de hoy y regenera `/public/products` y `src/kiosk/productImages.json`. Al final indica qué productos siguen sin foto nueva.
3. Ejecuta las pruebas, haz commit y despliega:
   ```bash
   npm test && npm run test:e2e
   ```
   La M10 toma las fotos nuevas sin reinstalar la APK.

## Formatos

- WebP calidad 80, sin metadatos. Tarjeta **384** y **640** px; detalle **960** px. Nunca se amplía una imagen.
- AVIF no se usa: su decodificación cuesta más CPU en una tablet económica y el ahorro a estos tamaños es marginal.

## Precarga y caché

- Durante la bienvenida se descargan **y decodifican** las fotos en el orden del menú: primera pantalla primero (4 en vertical, 8 en horizontal), máximo 3 a la vez, y después las de detalle. Cada URL se pide una sola vez (comprobado en E2E).
- Caché: `Cache-Control: immutable` en Vercel para `/products/*`. El service worker usa cache-first (`rofe-photos-v1`, separada del shell y limitada a 120 archivos). La WebView usa la caché HTTP. `/api/*` y el HTML nunca se cachean, así que la M10 no se queda con un frontend viejo.

### Mediciones (emulación: Chromium de escritorio, servidor local; **no son medidas de la M10 real**)

| Caso | Primera pantalla lista | Todas las fotos | Fotos visibles pintadas tras tocar «ORDENAR AQUÍ» |
| --- | --- | --- | --- |
| Frío, horizontal | 58 ms | 58 ms | 81 ms (incluye el render del menú) |
| Frío, vertical | 41 ms | 51 ms | 77 ms |
| Con caché (recarga), horizontal | 32 ms | 32 ms | — |
| Con caché (recarga), vertical | 27 ms | 36 ms | — |
| Red limitada 8 Mbps / 60 ms, en frío | 188–240 ms | 240–248 ms | (bienvenida visible a 1,05 s) |

En todos los casos la precarga terminó antes de tocar «ORDENAR AQUÍ».
