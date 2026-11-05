/**
 * Kiosk runtime settings. The Android shell appends them to the /kiosk URL
 * (e.g. `/kiosk?idle=90`), so they change without rebuilding the web app.
 */
export interface KioskSettings {
  /** Seconds without interaction before asking "¿Sigues ahí?". */
  idleSeconds: number;
  /** Seconds the "¿Sigues ahí?" prompt waits before cancelling the session. */
  idlePromptSeconds: number;
  /** Seconds the confirmation stays on screen before the next customer. */
  confirmationSeconds: number;
  /** Short vibration on add-to-cart and confirmed orders. */
  haptics: boolean;
}

export const DEFAULT_KIOSK_SETTINGS: KioskSettings = { idleSeconds: 90, idlePromptSeconds: 20, confirmationSeconds: 12, haptics: true };

function bounded(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

export function parseKioskSettings(search: string): KioskSettings {
  const params = new URLSearchParams(search);
  return {
    idleSeconds: bounded(params.get('idle'), DEFAULT_KIOSK_SETTINGS.idleSeconds, 20, 900),
    idlePromptSeconds: bounded(params.get('idlePrompt'), DEFAULT_KIOSK_SETTINGS.idlePromptSeconds, 5, 120),
    confirmationSeconds: bounded(params.get('confirm'), DEFAULT_KIOSK_SETTINGS.confirmationSeconds, 4, 120),
    haptics: params.get('haptics') !== '0',
  };
}
