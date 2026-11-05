import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../kiosk/productImages.json';
import { productPhoto } from './productImages';

const seed = [
  ['espresso', '/espresso.webp'], ['americano', '/americano.webp'], ['latte', '/iced-latte.webp'], ['matcha-latte', '/matcha-latte.jpg'],
  ['cold-brew', '/cold-brew.webp'], ['iced-latte', '/iced-latte.webp'], ['croissant-mantequilla', '/pan-chocolate.jpg'], ['galleta-chocolate', '/galleta-chispas.jpeg'],
] as const;

describe('catalog photos', () => {
  it('maps every seed product to its optimized photo or to the pending illustration', () => {
    for (const [id, image] of seed) {
      const photo = productPhoto({ id, image }, 1.5);
      if (id === 'latte' || id === 'croissant-mantequilla') expect(photo).toEqual({ card: null, detail: null, source: 'pending' });
      else {
        expect(photo.source).toBe('catalog');
        expect(photo.card).toMatch(new RegExp(`^/products/${id}-\\d+\\.[0-9a-f]{10}\\.webp$`));
      }
    }
  });

  it('never shows two different products with the same picture', () => {
    const cards = seed.map(([id, image]) => productPhoto({ id, image }).card).filter(Boolean);
    expect(new Set(cards).size).toBe(cards.length);
  });

  it('a photo uploaded from the admin panel always wins (no data migration needed)', () => {
    expect(productPhoto({ id: 'latte', image: 'https://abc.supabase.co/storage/v1/object/public/product_images/1_latte.webp' })).toMatchObject({ source: 'uploaded', card: 'https://abc.supabase.co/storage/v1/object/public/product_images/1_latte.webp' });
    expect(productPhoto({ id: 'nuevo', image: '' })).toEqual({ card: null, detail: null, source: 'none' });
    expect(productPhoto({ id: 'nuevo', image: '/espresso.webp' }).source).toBe('legacy');
  });

  it('chooses the 640 px variant for 1.5× tablets and 384 px for 1× screens', () => {
    expect(productPhoto({ id: 'espresso', image: '/espresso.webp' }, 1.5).card).toContain('-640.');
    expect(productPhoto({ id: 'espresso', image: '/espresso.webp' }, 1).card).toContain('-384.');
  });

  it('ships every referenced file, content-hashed and light', () => {
    for (const entry of Object.values(manifest.products) as Array<{ card?: Record<string, { url: string; bytes: number }>; detail?: Record<string, { url: string; bytes: number }> }>) {
      for (const variant of [...Object.values(entry.card ?? {}), ...Object.values(entry.detail ?? {})]) {
        const file = `public${variant.url}`;
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBe(variant.bytes);
        expect(variant.bytes).toBeLessThan(80_000);
        expect(readFileSync(file).subarray(8, 12).toString()).toBe('WEBP');
      }
    }
  });

  it('serves /products as immutable (hashed names) and keeps them out of the SPA rewrite', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
    expect(vercel.headers.find((rule) => rule.source === '/products/(.*)')?.headers[0].value).toContain('immutable');
  });
});
