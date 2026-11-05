import type { Order } from '../types';
let audio: AudioContext | undefined;
export async function enableBaristaAudio(): Promise<boolean> {
  try {
    const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return false;
    audio ??= new Constructor();
    if (audio.state !== 'running') await audio.resume();
    return audio.state === 'running';
  } catch { return false; }
}
export function playBaristaAlert(): boolean {
  if (!audio || audio.state !== 'running') return false;
  try {
    const now = audio.currentTime; const oscillator = audio.createOscillator(); const gain = audio.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(587.33, now); oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    gain.gain.setValueAtTime(0.12, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now + 0.4);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
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
