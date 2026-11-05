import { useEffect } from 'react';
import type { Product } from '../types';
import { productPhoto } from '../services/productImages';
import { preloadImage, preloadInOrder, type PreloadReport } from '../services/imagePreload';

declare global {
  interface Window { __rofeKioskPreload?: PreloadReport & { startedAt: number } }
}

/** Same order as the catalog's "Todo" tab, so the first screen is preloaded first. */
const displayOrder = (products: Product[]) => [...products].sort((left, right) => left.name.localeCompare(right.name, 'es'));

/**
 * Downloads and decodes the catalog photos as soon as the catalog is known — during the
 * welcome screen — first screen first, with bounded concurrency. Detail photos for the
 * product sheet follow at low priority. Re-runs only when the set of photo URLs changes.
 */
export function useCatalogPreload(products: Product[], stacked: boolean) {
  const cards = displayOrder(products).map((product) => productPhoto(product).card);
  const details = displayOrder(products).map((product) => productPhoto(product).detail);
  const key = cards.join('|');
  // Two columns × two rows in portrait; four × two in landscape.
  const firstScreen = stacked ? 4 : 8;
  useEffect(() => {
    if (!cards.length) return;
    let cancelled = false;
    const startedAt = performance.now();
    void preloadInOrder(cards, firstScreen).then((report) => {
      if (cancelled) return;
      window.__rofeKioskPreload = { ...report, startedAt };
      for (const url of details) void preloadImage(url, 'low');
    });
    return () => { cancelled = true; };
    // `key` captures the URLs; the arrays are recomputed each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, firstScreen]);
}
