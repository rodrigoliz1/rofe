import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import manifest from '../kiosk/productImages.json';
import { photoStatus, productPhoto } from './productImages';

const seed = [
  ['espresso', '/espresso.webp'], ['americano', '/americano.webp'], ['latte', '/iced-latte.webp'], ['matcha-latte', '/matcha-latte.jpg'],
  ['cold-brew', '/cold-brew.webp'], ['iced-latte', '/iced-latte.webp'], ['croissant-mantequilla', '/pan-chocolate.jpg'], ['galleta-chocolate', '/galleta-chispas.jpeg'],
] as const;

const productionRows = [
  // Rows seeded in production by an older app version (src/App.tsx defaults).
  ['espresso', '/espresso.png'], ['double-espresso', '/espresso.png'], ['latte', 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600'],
  ['flat-white', 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=600'], ['iced-matcha-latte', '/matcha-frio.jpg'],
  ['croissant-mantequilla', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600'], ['pain-au-chocolat', '/pan-chocolate.jpg'],
] as const;

describe('catalog photos', () => {
  it('covers the 12 products of the production catalog with an explicit status', () => {
    expect(Object.keys(manifest.products).sort()).toEqual(['americano', 'cold-brew', 'croissant-mantequilla', 'double-espresso', 'espresso', 'flat-white', 'galleta-chocolate', 'iced-latte', 'iced-matcha-latte', 'latte', 'matcha-latte', 'pain-au-chocolat']);
    for (const id of Object.keys(manifest.products)) expect(photoStatus(id)).toBe('approved');
  });

  it('never lets an old database reference (404 /espresso.png, external Unsplash) override the manifest', () => {
    for (const [id, image] of [...seed, ...productionRows]) {
      const photo = productPhoto({ id, image }, 1.5);
      expect(photo.card ?? '', `${id}`).not.toMatch(/espresso\.png|unsplash/);
      if (photoStatus(id) === 'pending') expect(photo).toEqual({ card: null, detail: null, source: 'pending' });
      else expect(photo.card).toMatch(new RegExp(`^/products/${id}-\\d+\\.[0-9a-f]{10}\\.webp$`));
    }
  });

  it('never shows two different products with the same picture', () => {
    const cards = Object.keys(manifest.products).map((id) => productPhoto({ id, image: '' }).card).filter(Boolean);
    expect(new Set(cards).size).toBe(cards.length);
  });

  it('an admin upload wins over interim and pending photos, and over approved ones only if newer', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://rofe.vercel.app' }, devicePixelRatio: 1 });
    const upload = (ts: number) => `https://abc.supabase.co/storage/v1/object/public/product_images/${ts}_latte.webp`;
    expect(productPhoto({ id: 'latte', image: upload(1_700_000_000_000) })).toMatchObject({ source: 'approved' });
    expect(productPhoto({ id: 'espresso', image: upload(Date.parse('2027-02-01')) })).toMatchObject({ source: 'uploaded' });
    expect(productPhoto({ id: 'nuevo', image: '/api/product-images/x.webp' }).source).toBe('uploaded');
    expect(productPhoto({ id: 'nuevo', image: '' })).toEqual({ card: null, detail: null, source: 'none' });
    expect(productPhoto({ id: 'nuevo', image: 'https://images.unsplash.com/x' }).source).toBe('none');
    expect(productPhoto({ id: 'nuevo', image: '/products/custom.webp' }).source).toBe('legacy');
    // Approved photo vs. upload: decided by the approval date in the manifest.
    vi.resetModules();
    vi.doMock('../kiosk/productImages.json', () => ({ default: { products: { espresso: { status: 'approved', approvedAt: '2027-01-01T00:00:00Z', card: { 640: { url: '/products/espresso-640.0123456789.webp', bytes: 1 } } } } } }));
    const fresh = await import('./productImages');
    expect(fresh.productPhoto({ id: 'espresso', image: upload(Date.parse('2026-06-01')) }, 1.5)).toMatchObject({ source: 'approved', card: '/products/espresso-640.0123456789.webp' });
    expect(fresh.productPhoto({ id: 'espresso', image: upload(Date.parse('2027-02-01')) }, 1.5)).toMatchObject({ source: 'uploaded' });
    expect(fresh.productPhoto({ id: 'espresso', image: '/espresso.png' }, 1.5).source).toBe('approved');
    vi.doUnmock('../kiosk/productImages.json');
    vi.unstubAllGlobals();
  });

  it('chooses the 640 px variant for 1.5× tablets and 384 px for 1× screens', () => {
    expect(productPhoto({ id: 'espresso', image: '/espresso.webp' }, 1.5).card).toContain('-640.');
    expect(productPhoto({ id: 'espresso', image: '/espresso.webp' }, 1).card).toContain('-384.');
  });

  it('ships every referenced file, content-hashed and light', () => {
    for (const entry of Object.values(manifest.products) as Array<{ card?: Record<string, { url: string; bytes: number }>; detail?: Record<string, { url: string; bytes: number }> }>) {
      for (const [kind, variant] of [...Object.values(entry.card ?? {}).map((value) => ['card', value] as const), ...Object.values(entry.detail ?? {}).map((value) => ['detail', value] as const)]) {
        const file = `public${variant.url}`;
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBe(variant.bytes);
        expect(variant.bytes, file).toBeLessThan(kind === 'card' ? 80_000 : 140_000);
        expect(readFileSync(file).subarray(8, 12).toString()).toBe('WEBP');
      }
    }
  });

  it('serves /products as immutable (hashed names) and keeps them out of the SPA rewrite', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
    expect(vercel.headers.find((rule) => rule.source === '/products/(.*)')?.headers[0].value).toContain('immutable');
  });
});
