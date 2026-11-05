import type { CartItem, Order } from '../types';

export interface CheckoutDraft {
  operationId: string;
  cartItems: CartItem[];
  total: number;
  customerName: string;
  paymentMethod: 'card' | 'cash';
  submitted: boolean;
  simulation?: boolean;
  order?: Order;
  /** Change voucher applied as a discount (validated again by the server). */
  voucher?: { code: string; amount: number };
}
const KEY = 'rofe-checkout-v1';
export function readCheckout(): CheckoutDraft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CheckoutDraft | null;
    return draft && typeof draft.operationId === 'string' && Array.isArray(draft.cartItems) && draft.submitted ? draft : null;
  } catch { return null; }
}
export function saveCheckout(draft: CheckoutDraft): void { localStorage.setItem(KEY, JSON.stringify(draft)); }
export function clearCheckout(): void { localStorage.removeItem(KEY); }
