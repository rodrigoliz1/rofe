# Catálogo fotográfico de ROFÉ

Cómo se resuelven, optimizan, precargan y cachean las fotos de productos, el inventario real a la fecha y lo que falta.

## Fuente de las imágenes

| Origen | Ejemplo | Cómo se muestra |
| --- | --- | --- |
| Producto del catálogo base (seed: `backend/src/domain/catalog.ts`, migración `001`) | `image = '/espresso.webp'` | Se sustituye por la variante optimizada de `/products/` según `src/kiosk/productImages.json`. |
| Foto subida desde Admin (Supabase Storage o `/api/product-images/…`) | `https://<proyecto>.supabase.co/storage/v1/object/public/product_images/…` | Se usa tal cual: **siempre tiene prioridad**. |
| Producto sin foto o con foto pendiente | `image = ''`, o el producto está marcado `pending` | Ilustración de marca (icono sobre fondo cálido). Nunca una foto equivocada. |

Resolución: `productPhoto()` en `src/services/productImages.ts`. Usa una sola URL determinista por producto y pantalla (384 px en pantallas 1×, 640 px en 1,5× como la M10) para `<img>` y para el precargador, así que nunca se descarga dos veces.

No hay cambios de esquema ni migraciones: la columna `products.image` sigue igual y los datos existentes funcionan sin tocarlos.

## Inventario (catálogo base, verificado en el repositorio)

Revisé los 8 productos del seed. No pude consultar la base de producción (Supabase) desde este entorno. Si en producción se agregaron productos o fotos desde Admin, esas fotos se muestran tal cual y no aparecen en esta tabla. Para auditarlas, revisa en Admin → Productos que cada uno tenga foto.

| ID | Nombre | Categoría | Imagen original | Formato / tamaño original | Peso original | Estado | Problema detectado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `espresso` | Espresso | coffee | `/espresso.webp` | WebP 3455×4496 | 567 KB | ✅ Optimizada | Gigante: ~60 MB de RAM decodificada para mostrarse a ~250 px. |
| `americano` | Americano | coffee | `/americano.webp` | WebP 640×427 | 45 KB | ✅ Optimizada | Resolución baja (máx. 427 px). |
| `latte` | Latte | coffee | `/iced-latte.webp` | WebP 1200×1800 | 137 KB | ⏳ **Pendiente** | **Foto equivocada**: mostraba el iced latte (bebida fría) para el latte caliente. |
| `matcha-latte` | Matcha latte | coffee | `/matcha-latte.jpg` | JPEG 736×736 | 65 KB | ✅ Optimizada | — |
| `cold-brew` | Cold brew | cold | `/cold-brew.webp` | WebP 1600×978 | 72 KB | ✅ Temporal | Aparecen una mano y un delantal; conviene una foto con el estilo maestro. |
| `iced-latte` | Iced latte | cold | `/iced-latte.webp` | WebP 1200×1800 | 137 KB | ✅ Optimizada | Comparte archivo con Latte (corregido). |
| `croissant-mantequilla` | Croissant de mantequilla | bakery | `/pan-chocolate.jpg` | JPEG 900×836 | 107 KB | ⏳ **Pendiente** | **Foto equivocada**: panes de chocolate, no un croissant de mantequilla. |
| `galleta-chocolate` | Galleta de chocolate | bakery | `/galleta-chispas.jpeg` | JPEG 1200×800 | 433 KB | ✅ Optimizada | Pesada para su uso. |
| — | (sin producto) | — | `/matcha-frio.jpg` | JPEG 1080×1080 | 85 KB | Sin uso | Ningún producto la usa. |

Resultado: todas las fotos de tarjeta pesan entre 9 y 24 KB (384 px) o entre 18 y 45 KB (640 px), cuadradas 1:1. Las pruebas comprueban HTTP 200, `image/webp`, menos de 80 KB por archivo y que ningún par de productos comparta foto.

**Licencias**: el repositorio no documenta el origen ni la licencia de las fotos originales. Antes de usarlas comercialmente, confirma que tienes derechos sobre ellas o sustitúyelas.

## Generación de imágenes: estado real

- **Canva** (`generate-image`): la herramienta está desactivada por el administrador del equipo de Canva.
- **Figma** (`generate_image`): requiere crear un archivo en tu cuenta y consume créditos de IA. La acción fue bloqueada por el control de permisos de esta sesión, porque no habías autorizado explícitamente usar tu cuenta de Figma.
- **No se generó ninguna imagen.** Las fotos actuales son las originales del repositorio, recortadas y optimizadas.

Para generar las pendientes, usa el estilo y los prompts de `scripts/product-images/sources.json` (ver abajo) en el generador que prefieras. Revísalas y apruébalas, y luego:

1. Copia la imagen aprobada a `scripts/product-images/originals/<id>.png` (o a `public/`).
2. En `sources.json`, pon `"source"` con esa ruta, ajusta `"focus"` si hace falta y cambia `"status"` a `"approved"`.
3. Ejecuta el script; regenera `/public/products` y el manifiesto.
   ```bash
   python3 scripts/product-images/build.py
   ```
4. Haz commit y despliega. Como los nombres llevan hash, la tablet descarga solo las fotos nuevas.

### Estilo maestro

> Hyperrealistic advertising product photograph for a premium espresso bar menu. Square 1:1 frame, product centered and filling about 60% of the frame, camera at a three-quarter angle slightly above the subject, same scale and perspective for every product. Soft diffused studio key light from the left, gentle fill, subtle soft shadow. Seamless warm neutral background in beige and cream with a soft gradient, matte light stone surface. Minimalist composition, realistic textures, appetizing. No text, no logos, no brands, no people, no faces, no hands, no props or decorations beyond what is described.

### Prompts por producto (estilo maestro + descripción)

| Producto | Prioridad | Descripción |
| --- | --- | --- |
| Latte | **Alta (pendiente)** | A hot café latte in a wide cream-colored ceramic cup on a saucer, glossy microfoam with a symmetrical rosetta latte art, warm caramel-brown edges, light steam, nothing else on the surface. |
| Croissant de mantequilla | **Alta (pendiente)** | A single golden butter croissant with crisp flaky laminated layers and a glossy egg-washed crust, resting on a small cream ceramic plate, a few flakes of pastry on the surface. |
| Cold brew | Media | A cold brew coffee in a tall clear tumbler with large clear ice cubes, deep amber-mahogany color with light passing through, tiny condensation droplets on the glass, nothing else on the surface. |
| Americano | Media (baja resolución) | An americano in a clear double-walled glass mug, deep brown coffee with a thin light crema on top, visible transparency of the glass, nothing else on the surface. |
| Espresso | Uniformidad | A double espresso in a small white ceramic demitasse on a matching saucer, thick golden-hazelnut crema with fine tiger striping, a few drops of crema on the rim, nothing else on the surface. |
| Iced latte | Uniformidad | An iced latte in a tall clear glass with ice cubes, milk and espresso gently layered from cream to caramel brown, a clear glass straw, light condensation, nothing else on the surface. |
| Matcha latte | Uniformidad | A hot matcha latte in a white ceramic cup, vivid jade-green surface with white leaf latte art, velvety microfoam, nothing else on the surface. |
| Galleta de chocolate | Uniformidad | Two soft-baked chocolate chip cookies stacked slightly offset, golden edges, melted dark chocolate chunks, a light dusting of flaky sea salt, on parchment over the stone surface. |

Las actuales tienen fondos y luces distintos (madera, piedra gris, fondo negro). Para un catálogo uniforme conviene regenerar las 8 con el mismo estilo maestro.

## Formatos y variantes

- **WebP** calidad 80, sin metadatos, recorte 1:1 por producto (`focus` en `sources.json`). Nunca se amplía una imagen pequeña.
- Variantes: tarjeta **384** y **640** px; detalle **960** px (o el máximo disponible) para la hoja de producto.
- **AVIF no se usa**: en una tablet económica su decodificación cuesta más CPU que WebP y el ahorro a estos tamaños (10–40 KB) es marginal. WebP funciona en toda WebView moderna.
- Nombres deterministas `<id>-<px>.<sha256[:10]>.webp`: mismo contenido, mismo nombre.

## Precarga (bienvenida → menú)

`useCatalogPreload` (en `src/kiosk/`) y `src/services/imagePreload.ts`:

1. El catálogo se pide al abrir la app (`/api/products`, con respaldo en IndexedDB).
2. Mientras se muestra «Un buen café. Un momento para ti.», se descargan **y decodifican** (`HTMLImageElement.decode()`) las fotos en el orden del menú. La primera pantalla (4 en vertical, 8 en horizontal) va con prioridad alta y el resto después, con máximo 3 descargas simultáneas. Al final se cargan las fotos de detalle con prioridad baja.
3. Las imágenes decodificadas quedan referenciadas, así que el bitmap sigue en memoria. Una tarjeta cuya foto ya está lista se pinta sin transición.
4. Si la tablet recién arrancó y aún no terminó: skeleton del tamaño exacto (sin saltos de layout) y fundido de 160 ms al llegar. Nada espera a la precarga para funcionar.

Medición (emulada: Chromium de escritorio, servidor local, sin limitar la red):

| Perfil | Primera pantalla precargada | Todo el catálogo | Fotos visibles pintadas tras tocar «ORDENAR AQUÍ» |
| --- | --- | --- | --- |
| M10 horizontal (1280×800) | 43 ms | 43 ms | 92 ms (incluye el render del menú) |
| M10 vertical (800×1280) | 30 ms | 34 ms | 85 ms |

No son medidas de la tablet real. En la M10 sobre Wi-Fi, la descarga de las 6 fotos (unos 180 KB) ocurre durante la bienvenida. El test exige menos de 500 ms entre el toque y las fotos pintadas, y que ninguna foto se pida dos veces.

## Caché

| Capa | Qué guarda | Invalidación |
| --- | --- | --- |
| HTTP (Vercel) | `/products/*` con `Cache-Control: public, max-age=31536000, immutable` | El nombre cambia cuando cambia la foto (hash). |
| Service worker | Caché `rofe-photos-v1`, cache-first solo para `/products/*.webp`; máximo 120 archivos | Archivos nuevos con otro nombre; los más antiguos se recortan. Separada de la caché del shell: una actualización de la app no borra las fotos. |
| WebView (APK) | Caché HTTP normal (`LOAD_DEFAULT`) | Igual que HTTP. *Limpiar caché* en el menú admin la borra. |
| No se cachea | `/api/*` (pedidos, pagos, sesiones), HTML (network-first) | — |

La tablet nunca se queda con un frontend viejo: el HTML se pide siempre a la red (network-first), los JS/CSS llevan hash y las fotos también.
