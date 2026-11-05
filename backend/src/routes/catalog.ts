import express from 'express';
import path from 'path';
import { z } from 'zod';
import { db } from '../db';
import { requireRole } from '../middleware/auth';
import { AppError } from '../utils/errors';
import type { RouteContext } from './context';

const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(100),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''),
  price: z.number().min(0).max(100_000),
  category: z.enum(['coffee', 'cold', 'bakery']),
  icon: z.string().max(80).default(''),
  customizable: z.boolean().default(false),
  image: z.string().max(2_048).default(''),
  recipe: z.record(z.string().min(1).max(100), z.number().min(0).max(1_000_000)).optional(),
  custom_variants: z.array(z.object({
    title: z.string().trim().min(1).max(80),
    options: z.array(z.object({ name: z.string().trim().min(1).max(80), priceModifier: z.number().min(0).max(100_000) })).max(30),
  })).max(20).optional(),
});
const hasExpectedImageSignature = (buffer: Buffer, mimeType: 'image/jpeg' | 'image/png' | 'image/webp') => {
  if (mimeType === 'image/jpeg') return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
};

export function registerCatalogRoutes(app: express.Express, { env, requireAuth, audit, broadcast }: RouteContext): void {
// Image Upload
app.post('/api/upload-image', requireAuth, requireRole('ADMIN', 'MANAGER'), express.json({ limit: '1500kb' }), async (req, res, next) => {
  try {
    const { fileBase64, fileName, mimeType } = z.object({
      fileBase64: z.string().max(1_400_000),
      fileName: z.string().trim().min(1).max(160),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    }).parse(req.body);

    const dataUrl = fileBase64.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!dataUrl || dataUrl[1] !== mimeType) throw new AppError(400, 'INVALID_IMAGE', 'El contenido de la imagen no es válido.');
    const buffer = Buffer.from(dataUrl[2], 'base64');
    if (buffer.byteLength > 1_000_000) throw new AppError(413, 'IMAGE_TOO_LARGE', 'La imagen no puede superar 1 MB.');
    if (!hasExpectedImageSignature(buffer, mimeType)) throw new AppError(400, 'INVALID_IMAGE', 'El archivo no coincide con el formato indicado.');
    
    // Asumimos que db tiene acceso a la instancia de supabase si es SupabaseDbAdapter
    // Dado que db.ts abstrae esto, podemos añadir una función en DbAdapter o manejarlo directamente
    // si exportamos supabase desde algun lado. Pero vamos a añadir la función a db.ts
    const url = await db.uploadProductImage(fileName, buffer, mimeType);
    res.json({ url });
  } catch (error) {
    next(error);
  }
});

if (env.NODE_ENV !== 'production' && !env.SUPABASE_URL) {
  const imageDirectory = path.join(path.dirname(env.DB_FILE_PATH || path.join(process.cwd(), 'db.json')), 'rofe-product-images');
  app.use('/api/product-images', express.static(imageDirectory, { dotfiles: 'deny', maxAge: '1d' }));
}

app.get('/api/products', async (_req, res) => {
  try {
    const [products, raw] = await Promise.all([db.getProducts(), db.getRawInventory()]);
    const ingredients = new Map(raw.map((entry) => [entry.id, entry]));
    res.json(products.map((product) => {
      const recipe = Object.entries(product.recipe ?? {}).filter(([, quantity]) => quantity > 0);
      const stock = recipe.length ? Math.max(0, Math.min(...recipe.map(([id, quantity]) => { const ingredient = ingredients.get(id); return ingredient ? Math.floor((ingredient.stock - (ingredient.reservedStock ?? 0)) / quantity) : 0; }))) : undefined;
      return { ...product, stock };
    }));
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener productos.' });
  }
});

app.post('/api/products', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const product = productSchema.parse(req.body);
    await db.createProduct(product);
    await audit(req, { action: 'PRODUCT_CHANGE', entity: 'PRODUCT', entityId: product.id, after: product });
    broadcast({ type: 'inventory_updated' });
    res.status(201).json({ message: 'Producto creado' });
  } catch (error) {
    next(error);
  }
});

app.put('/api/products/:id', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const before = (await db.getProducts()).find((product) => product.id === req.params.id);
    if (!before) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.');
    const parsed = productSchema.parse(req.body);
    if (parsed.id !== req.params.id) throw new AppError(400, 'PRODUCT_ID_MISMATCH', 'El identificador del producto no coincide con la ruta.');
    await db.updateProduct(req.params.id, parsed);
    await audit(req, { action: 'PRODUCT_CHANGE', entity: 'PRODUCT', entityId: req.params.id, before, after: parsed });
    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Producto actualizado' });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/products/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const before = (await db.getProducts()).find((product) => product.id === req.params.id);
    await db.deleteProduct(req.params.id);
    await audit(req, { action: 'PRODUCT_CHANGE', entity: 'PRODUCT', entityId: req.params.id, before, after: { deleted: true } });
    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Producto eliminado' });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

app.post('/api/products/price', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { id, price } = z.object({ id: z.string().min(1).max(100), price: z.number().min(0).max(100_000) }).parse(req.body);
    const before = (await db.getProducts()).find((product) => product.id === id);
    await db.updateProductPrice(id, price);
    await audit(req, { action: 'PRICE_CHANGE', entity: 'PRODUCT', entityId: id, before: { price: before?.price }, after: { price } });
    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Precio actualizado con éxito.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/products/recipe', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { productId, recipe } = z.object({
      productId: z.string().min(1).max(100),
      recipe: z.record(z.string().min(1).max(100), z.number().min(0).max(1_000_000)),
    }).parse(req.body);
    const before = (await db.getProducts()).find((product) => product.id === productId);
    await db.updateProductRecipe(productId, recipe);
    await audit(req, { action: 'PRODUCT_CHANGE', entity: 'RECIPE', entityId: productId, before: before?.recipe, after: recipe });
    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Receta actualizada con éxito.' });
  } catch (error) {
    next(error);
  }
});


}
