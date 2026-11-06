import type { Order } from '../types';
import alertSoundUrl from '../assets/audio/nuevo_pedido.mp3';

let audio: AudioContext | undefined;
let alertBuffer: AudioBuffer | undefined;
let loadingSound: Promise<void> | undefined;

function loadSound(context: AudioContext): Promise<void> {
  if (alertBuffer) return Promise.resolve();
  loadingSound ??= (async () => {
    const response = await fetch(alertSoundUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('No se pudo cargar el sonido de pedidos.');
    alertBuffer = await context.decodeAudioData(await response.arrayBuffer());
  })().catch(cause => { loadingSound = undefined; throw cause; });
  return loadingSound;
}

export async function enableBaristaAudio(): Promise<boolean> {
  try {
    const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return false;
    audio ??= new Constructor();
    // Resume immediately in the user gesture, before waiting for the MP3 download.
    const resume = audio.state === 'running' ? Promise.resolve() : audio.resume();
    await Promise.all([resume, loadSound(audio)]);
    return audio.state === 'running' && Boolean(alertBuffer);
  } catch { return false; }
}

export function playBaristaAlert(): boolean {
  if (!audio || audio.state !== 'running' || !alertBuffer) return false;
  try {
    const source = audio.createBufferSource();
    source.buffer = alertBuffer;
    source.connect(audio.destination);
    source.onended = () => source.disconnect();
    source.start();
    return true;
  } catch { return false; }
}

export function isAlertable(order: Pick<Order, 'status' | 'paymentMethod'>): boolean {
  return order.status === 'PAID' || (order.status === 'PENDING_PAYMENT' && order.paymentMethod === 'cash');
}
export function unannouncedOrders(orders: Order[], announced: Set<string>): string[] {
  return [...new Set(orders.filter(order => isAlertable(order) && !announced.has(order.id)).map(order => order.id))];
}
export function loadAlertLedger(key: string): Set<string> {
  try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string').slice(-2000) : []); }
  catch { return new Set(); }
}
export function saveAlertLedger(key: string, ids: Set<string>) { try { localStorage.setItem(key, JSON.stringify([...ids].slice(-2000))); } catch { /* In-memory protection still covers this session when storage is unavailable. */ } }
