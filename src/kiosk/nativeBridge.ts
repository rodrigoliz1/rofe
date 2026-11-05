/**
 * Contract with the ROFE Kiosk Android shell.
 *
 * web → native: `window.rofeNative.postMessage(json)`. The object only exists when the
 *   shell registered it with WebViewCompat.addWebMessageListener for the ROFE origin,
 *   so other origins never see it. Messages carry no secrets.
 * native → web: the shell calls `window.rofeKiosk.*` through evaluateJavascript.
 */
export type NativeMessage =
  | { type: 'ready'; webVersion: string }
  | { type: 'admin' }
  | { type: 'session-reset' };

export interface KioskApi {
  /** Android Back. Always consumes the event: the customer never leaves ROFE. */
  back(): boolean;
  /** Admin menu: return to the welcome screen with an empty order. */
  resetSession(): void;
  /** Admin menu: open the existing server-authenticated staff login. */
  openStaffAccess(): void;
  webVersion: string;
}

interface NativePort { postMessage(message: string): void }
declare global {
  interface Window { rofeNative?: NativePort; rofeKiosk?: KioskApi }
}

export const WEB_VERSION = typeof __ROFE_WEB_VERSION__ === 'string' ? __ROFE_WEB_VERSION__ : 'dev';

export function isNativeShell(): boolean {
  return typeof window.rofeNative?.postMessage === 'function' || /\bROFE(?:Kiosk|Barista)\//.test(navigator.userAgent);
}

/** Returns false when no native shell is listening (plain browser or PWA). */
export function postNative(message: NativeMessage): boolean {
  const port = window.rofeNative;
  if (typeof port?.postMessage !== 'function') return false;
  try { port.postMessage(JSON.stringify(message)); return true; } catch { return false; }
}

export function vibrate(pattern: number | number[], enabled: boolean): void {
  if (!enabled || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch { /* Vibration is optional feedback. */ }
}
