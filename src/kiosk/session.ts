import type { CartItem } from '../types';

export type KioskCategory = 'all' | 'coffee' | 'cold' | 'bakery';
export interface KioskSession { started: boolean; cart: CartItem[]; category: KioskCategory; savedAt: number }

const KEY = 'rofe-kiosk-session-v1';

/**
 * The customer's unfinished order survives a reload (renderer crash, admin reload)
 * in sessionStorage, but only for as long as the inactivity timeout: a later reload
 * must never show the previous customer's order.
 */
export function readKioskSession(maxAgeMs: number, now = Date.now()): KioskSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as KioskSession | null;
    if (!value || typeof value.savedAt !== 'number' || !Array.isArray(value.cart) || now - value.savedAt > maxAgeMs || now < value.savedAt) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch { return null; }
}

export function saveKioskSession(session: Omit<KioskSession, 'savedAt'>, now = Date.now()): void {
  try {
    if (!session.started && session.cart.length === 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify({ ...session, savedAt: now }));
  } catch { /* Private mode or full storage: the order simply is not restored after a reload. */ }
}

export function clearKioskSession(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* Nothing to clear. */ }
}
