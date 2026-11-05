/**
 * Image preloader for the kiosk: downloads and decodes catalog photos while the welcome
 * screen is shown, so «ORDENAR AQUÍ» opens a menu whose photos are already painted.
 *
 * - Limited concurrency (default 3): never floods a modest tablet or a busy Wi-Fi.
 * - Priority queue: the first visible row first, then the rest, then detail photos.
 * - One request per URL: the same URL the <img> uses, so the HTTP / service-worker cache
 *   serves it; decoded images are kept referenced so the bitmap stays warm.
 * - Never blocks the UI: failures resolve quietly and the card falls back to its skeleton.
 */
type Priority = 'high' | 'low';
interface Job { url: string; priority: Priority; resolve: () => void }

const ready = new Set<string>();
const pending = new Map<string, Promise<void>>();
const decoded = new Map<string, HTMLImageElement>();
const queue: Job[] = [];
let active = 0;
let concurrency = 3;
const listeners = new Set<(url: string) => void>();

export function isImageReady(url: string | null | undefined): boolean {
  return Boolean(url && ready.has(url));
}

export function onImageReady(listener: (url: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setPreloadConcurrency(value: number) { concurrency = Math.max(1, Math.min(6, Math.round(value))); }

function pump() {
  while (active < concurrency && queue.length) {
    const index = queue.findIndex((job) => job.priority === 'high');
    const [job] = queue.splice(index >= 0 ? index : 0, 1);
    active += 1;
    const image = new Image();
    image.decoding = 'async';
    if (job.priority === 'high') image.fetchPriority = 'high';
    const done = (ok: boolean) => {
      active -= 1;
      if (ok) {
        ready.add(job.url);
        decoded.set(job.url, image);
        for (const listener of listeners) listener(job.url);
      }
      job.resolve();
      pump();
    };
    image.onload = () => { (image.decode ? image.decode() : Promise.resolve()).then(() => done(true), () => done(true)); };
    image.onerror = () => done(false);
    image.src = job.url;
  }
}

export function preloadImage(url: string | null | undefined, priority: Priority = 'low'): Promise<void> {
  if (!url || ready.has(url)) return Promise.resolve();
  const existing = pending.get(url);
  if (existing) {
    if (priority === 'high') { const job = queue.find((candidate) => candidate.url === url); if (job) job.priority = 'high'; pump(); }
    return existing;
  }
  const promise = new Promise<void>((resolve) => { queue.push({ url, priority, resolve }); });
  pending.set(url, promise);
  pump();
  return promise;
}

export interface PreloadReport { firstScreen: number; total: number; firstScreenMs: number; allMs: number }

/** Preloads `urls` in order; the first `firstScreen` are high priority. */
export async function preloadInOrder(urls: Array<string | null>, firstScreen: number): Promise<PreloadReport> {
  const started = performance.now();
  const unique = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  const head = unique.slice(0, firstScreen);
  const firstDone = Promise.all(head.map((url) => preloadImage(url, 'high')));
  const rest = Promise.all(unique.slice(firstScreen).map((url) => preloadImage(url, 'low')));
  await firstDone;
  const firstScreenMs = performance.now() - started;
  await rest;
  return { firstScreen: head.length, total: unique.length, firstScreenMs, allMs: performance.now() - started };
}

/** Test hook: forget everything (unit tests only). */
export function resetPreloaderForTests() { ready.clear(); pending.clear(); decoded.clear(); queue.length = 0; active = 0; }
