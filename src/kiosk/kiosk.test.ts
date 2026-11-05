import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_KIOSK_SETTINGS, parseKioskSettings } from './config';
import { handleBack, pushBackHandler } from './backStack';
import { clearKioskSession, readKioskSession, saveKioskSession } from './session';
import type { CartItem } from '../types';

describe('kiosk settings', () => {
  it('uses the defaults without parameters', () => {
    expect(parseKioskSettings('')).toEqual(DEFAULT_KIOSK_SETTINGS);
  });
  it('accepts values from the Android shell and keeps them in safe bounds', () => {
    expect(parseKioskSettings('?idle=120&idlePrompt=15&confirm=8&haptics=0')).toEqual({ idleSeconds: 120, idlePromptSeconds: 15, confirmationSeconds: 8, haptics: false });
    expect(parseKioskSettings('?idle=1&idlePrompt=9999&confirm=abc')).toMatchObject({ idleSeconds: 20, idlePromptSeconds: 120, confirmationSeconds: DEFAULT_KIOSK_SETTINGS.confirmationSeconds });
  });
});

describe('kiosk back stack', () => {
  it('runs the most recent handler first and never falls through once consumed', () => {
    const calls: string[] = [];
    const removeRoot = pushBackHandler(() => { calls.push('root'); return true; });
    const removeModal = pushBackHandler(() => { calls.push('modal'); return true; });
    expect(handleBack()).toBe(true);
    removeModal();
    expect(handleBack()).toBe(true);
    removeRoot();
    expect(handleBack()).toBe(false);
    expect(calls).toEqual(['modal', 'root']);
  });
  it('lets a handler decline so the one below decides', () => {
    const removeRoot = pushBackHandler(() => true);
    const removeDecline = pushBackHandler(() => false);
    expect(handleBack()).toBe(true);
    removeDecline(); removeRoot();
  });
});

describe('kiosk session', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) });
  afterEach(() => store.clear());
  const item = { id: 'latte-regular', quantity: 1, totalPrice: 55 } as CartItem;

  it('restores the current customer order after a reload', () => {
    saveKioskSession({ started: true, cart: [item], category: 'coffee' }, 1_000);
    expect(readKioskSession(90_000, 30_000)).toMatchObject({ started: true, cart: [item], category: 'coffee' });
  });
  it('never restores an order older than the inactivity timeout', () => {
    saveKioskSession({ started: true, cart: [item], category: 'all' }, 1_000);
    expect(readKioskSession(90_000, 200_000)).toBeNull();
    expect(store.size).toBe(0);
  });
  it('rejects timestamps from the future and clears on reset', () => {
    saveKioskSession({ started: true, cart: [item], category: 'all' }, 50_000);
    expect(readKioskSession(90_000, 10_000)).toBeNull();
    saveKioskSession({ started: true, cart: [item], category: 'all' }, 1_000);
    clearKioskSession();
    expect(readKioskSession(90_000, 2_000)).toBeNull();
  });
  it('does not keep a session without products', () => {
    saveKioskSession({ started: true, cart: [], category: 'coffee' }, 1_000);
    expect(store.size).toBe(0);
  });
});
