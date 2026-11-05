import type { Product } from '../types';
import manifest from '../kiosk/productImages.json';
import { apiUrl } from './api';

/**
 * Catalog photos — explicit precedence policy (see docs/CATALOG_PHOTOS.md):
 *
 * 1. APPROVED photo of the new collection (manifest status "approved").
 *    Wins over anything stored in the database, except…
 * 2. …a photo UPLOADED FROM ADMIN after that approval (Supabase Storage names start with
 *    the upload timestamp). An upload also wins over interim/pending photos.
 * 3. INTERIM photo (manifest status "interim"): an old repository photo that shows the
 *    right product, optimized, used only until the new collection is approved.
 * 4. PENDING (no correct photo yet): brand illustration — never a wrong picture.
 *
 * Old database references (/espresso.png, seed paths, external Unsplash URLs blocked by the
 * Android shell) are never trusted over the manifest. Files are content-hashed, so a new
 * approval changes the URL and every cache (HTTP, service worker, WebView) picks it up.
 */
interface Variant { url: string; bytes: number }
type Status = 'approved' | 'interim' | 'pending';
interface ManifestEntry { status: Status; approvedAt?: string; card?: Record<string, Variant>; detail?: Record<string, Variant> }
const entries = (manifest as { products: Record<string, ManifestEntry> }).products;

export type PhotoSource = 'approved' | 'uploaded' | 'interim' | 'pending' | 'legacy' | 'none';
export interface ProductPhoto {
  /** Card image (null → branded illustration). */
  card: string | null;
  /** Larger image for the product sheet. */
  detail: string | null;
  source: PhotoSource;
}

const pick = (variants: Record<string, Variant> | undefined, minWidth: number) => {
  if (!variants) return null;
  const sorted = Object.entries(variants).map(([size, variant]) => [Number(size), variant.url] as const).sort((a, b) => a[0] - b[0]);
  return (sorted.find(([size]) => size >= minWidth) ?? sorted.at(-1))?.[1] ?? null;
};

/** Admin uploads: Supabase Storage (product_images bucket) or the dev server's /api/product-images. */
export function uploadedPhoto(image: string): { url: string; uploadedAt: number } | null {
  if (image.startsWith('/api/product-images/')) return { url: apiUrl(image), uploadedAt: Number.POSITIVE_INFINITY };
  const match = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/product_images\/(\d{13})?[^/]*$/i.exec(image);
  if (!match) return null;
  return { url: image, uploadedAt: match[1] ? Number(match[1]) : Number.POSITIVE_INFINITY };
}

/** One deterministic URL per product and screen, shared by <img> and the preloader. */
export function productPhoto(product: Pick<Product, 'id' | 'image'>, devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1): ProductPhoto {
  const entry = entries[product.id];
  const uploaded = uploadedPhoto(product.image?.trim() ?? '');
  const fromManifest = (source: 'approved' | 'interim'): ProductPhoto => ({
    // Cards render at ~200–360 CSS px; 1.5× tablets need the 640 px variant.
    card: pick(entry!.card, devicePixelRatio > 1.25 ? 600 : 380),
    detail: pick(entry!.detail, 900) ?? pick(entry!.card, 600),
    source,
  });
  if (entry?.status === 'approved' && entry.card) {
    const approvedAt = entry.approvedAt ? Date.parse(entry.approvedAt) : 0;
    if (uploaded && uploaded.uploadedAt > approvedAt) return { card: uploaded.url, detail: uploaded.url, source: 'uploaded' };
    return fromManifest('approved');
  }
  if (uploaded) return { card: uploaded.url, detail: uploaded.url, source: 'uploaded' };
  if (entry?.status === 'interim' && entry.card) return fromManifest('interim');
  if (entry) return { card: null, detail: null, source: 'pending' };
  // Products created from Admin without a manifest entry: only same-origin files are trusted.
  const image = product.image?.trim() ?? '';
  if (image.startsWith('/') && !image.startsWith('//')) return { card: image, detail: image, source: 'legacy' };
  return { card: null, detail: null, source: 'none' };
}

/** For reports and tests: the catalog's photo status per product id. */
export function photoStatus(productId: string): Status | 'unknown' {
  return entries[productId]?.status ?? 'unknown';
}
