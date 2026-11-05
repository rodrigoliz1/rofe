import type { CartItem, Product, OrderStatus, PaymentStatus, CustomizationOptions } from '../types';
import { apiUrl, publicError } from './api';

export interface PickupMenu {
  acceptingOrders: boolean; locationName: string; locationAddress: string; instructions: string; currency: 'MXN'; products: Product[];
}
export interface PickupOrder {
  id: string; folio: string; customerName: string; status: OrderStatus; paymentStatus: PaymentStatus; total: number; createdAt: string; notes?: string;
  items: Array<{ productName: string; quantity: number; unitPrice: number; totalPrice: number; customizable?: boolean; customization?: CustomizationOptions; modifiers?: Array<{ name: string; amount: number }>; selectedCustomVariants?: Record<string, string> }>;
  pickup: { locationName: string; locationAddress: string; expiresAt: string };
}
export interface PickupAttempt {
  operationId: string; accessToken: string; customerName: string; standId: string; notes: string;
  items: Array<{ productId: string; quantity: number; customization: CartItem['customization']; selectedCustomVariants?: Record<string, string> }>;
}
export interface PickupReceipt { id: string; accessToken: string; folio?: string }
export interface PickupDraft { cart: CartItem[]; customerName: string; notes: string; standId: string; attempt?: PickupAttempt; receipts: PickupReceipt[]; activeReceipt?: PickupReceipt }
const STORAGE_KEY = 'rofe-pickup-v1';
export class PickupApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
const validReceipt = (value: PickupReceipt) => /^[a-f0-9-]{36}$/.test(value?.id) && /^[a-f0-9]{64}$/.test(value?.accessToken);

export function readPickupDraft(): PickupDraft {
  let saved: Partial<PickupDraft> = {};
  try { saved = (JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') ?? {}) as Partial<PickupDraft>; } catch { /* Start with a clean draft if this browser has corrupt storage. */ }
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const returnReceipt = { id: params.get('pedido') ?? '', accessToken: hash.get('clave') ?? '' };
  const receipts = Array.isArray(saved.receipts) ? saved.receipts.filter(validReceipt).slice(0, 5) : [];
  if (validReceipt(returnReceipt) && !receipts.some((receipt) => receipt.id === returnReceipt.id)) receipts.unshift(returnReceipt);
  const activeReceipt = validReceipt(returnReceipt) ? returnReceipt : receipts.find((receipt) => receipt.id === params.get('pedido')) ?? (saved.attempt ? { id: saved.attempt.operationId, accessToken: saved.attempt.accessToken } : undefined);
  return {
    cart: Array.isArray(saved.cart) ? saved.cart.filter((item) => item?.product && typeof item.product.name === 'string' && typeof item.product.id === 'string' && item.customization && typeof item.customization.size === 'string' && Number.isFinite(item.totalPrice) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20).slice(0, 20) : [],
    customerName: typeof saved.customerName === 'string' ? saved.customerName.slice(0, 80) : '', notes: typeof saved.notes === 'string' ? saved.notes.slice(0, 240) : '',
    standId: /^[a-z0-9-]{1,40}$/.test(params.get('stand') ?? '') ? params.get('stand')! : typeof saved.standId === 'string' && /^[a-z0-9-]{1,40}$/.test(saved.standId) ? saved.standId : 'principal',
    receipts: receipts.slice(0, 5), activeReceipt: activeReceipt && validReceipt(activeReceipt) ? activeReceipt : undefined,
    attempt: saved.attempt && validReceipt({ id: saved.attempt.operationId, accessToken: saved.attempt.accessToken }) && Array.isArray(saved.attempt.items) ? saved.attempt : undefined,
  };
}
export function savePickupDraft(draft: PickupDraft): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); return true; } catch { return false; }
}
export function newPickupToken(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
export async function pickupRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(apiUrl(`/api/pickup${path}`), { ...init, credentials: 'omit', cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(25_000) }); }
  catch (error) { if (init.signal?.aborted) throw error; throw new Error('No pudimos conectar con la cafetería. Comprueba tu conexión e intenta de nuevo.', { cause: error }); }
  if (!response.ok) {
    const message = response.headers.get('content-type')?.includes('application/json') ? await publicError(response) : 'No pudimos conectar con la cafetería. Intenta de nuevo en un momento.';
    throw new PickupApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}
export function openStripeCheckout(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'checkout.stripe.com') throw new Error('No pudimos abrir el pago seguro. Conserva tu pedido y solicita ayuda en barra.');
  window.location.assign(url);
}
