import type { Product } from '../types';
import manifest from '../kiosk/productImages.json';
import { apiUrl } from './api';

/**
 * Catalog photos.
 *
 * Seed products point at the original files in /public (`/espresso.webp`, …). Those are
 * replaced by the optimized, square, content-hashed variants in /products (built by
 * scripts/product-images/build.py). A photo uploaded from the admin panel (Supabase
 * Storage or /api/product-images/…) always wins, so production data needs no migration.
 * Products whose photo is still pending show the branded illustration instead of a
 * wrong picture (e.g. a hot latte shown with the iced-latte photo).
 */
interface Variant { url: string; bytes: number }
interface ManifestEntry { status: 'approved' | 'pending'; card?: Record<string, Variant>; detail?: Record<string, Variant> }
const entries = (manifest as { products: Record<string, ManifestEntry> }).products;

/** Original paths shipped with the seed catalog (migration 001 / domain/catalog.ts). */
const SEED_PATHS = new Set(['/espresso.webp', '/americano.webp', '/iced-latte.webp', '/matcha-latte.jpg', '/cold-brew.webp', '/pan-chocolate.jpg', '/galleta-chispas.jpeg', '/matcha-frio.jpg']);

export interface ProductPhoto {
  /** Card image (null → branded illustration). */
  card: string | null;
  /** Larger image for the product sheet. */
  detail: string | null;
  source: 'uploaded' | 'catalog' | 'legacy' | 'pending' | 'none';
}

const pick = (variants: Record<string, Variant> | undefined, minWidth: number) => {
  if (!variants) return null;
  const sorted = Object.entries(variants).map(([size, variant]) => [Number(size), variant.url] as const).sort((a, b) => a[0] - b[0]);
  return (sorted.find(([size]) => size >= minWidth) ?? sorted.at(-1))?.[1] ?? null;
};

/** One deterministic URL per product and screen, shared by <img> and the preloader. */
export function productPhoto(product: Pick<Product, 'id' | 'image'>, devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1): ProductPhoto {
  const image = product.image?.trim() ?? '';
  if (image && !SEED_PATHS.has(image)) {
    const url = image.startsWith('/api/') ? apiUrl(image) : image;
    return { card: url, detail: url, source: 'uploaded' };
  }
  const entry = entries[product.id];
  if (entry?.status === 'approved' && entry.card) {
    // Cards render at ~200–360 CSS px; 1.5× tablets need the 640 px variant.
    return { card: pick(entry.card, devicePixelRatio > 1.25 ? 600 : 380), detail: pick(entry.detail, 900) ?? pick(entry.card, 600), source: 'catalog' };
  }
  if (entry?.status === 'pending') return { card: null, detail: null, source: 'pending' };
  return image ? { card: image, detail: image, source: 'legacy' } : { card: null, detail: null, source: 'none' };
}
