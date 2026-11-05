import { handleBack } from './backStack';

export const KIOSK_VIEWPORT = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select, [contenteditable="true"]'));

/**
 * Browser-level protections for a customer-facing terminal. The Android shell enforces
 * the same rules natively (zoom disabled, no context menu, Back intercepted); these keep
 * the kiosk safe in Chrome / an installed PWA too. Inputs keep normal selection.
 */
export function installKioskGuards(): () => void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const previousViewport = meta?.content;
  if (meta) meta.content = KIOSK_VIEWPORT;
  document.documentElement.classList.add('kiosk-mode');

  const listeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions]> = [];
  const on = (target: EventTarget, type: string, listener: EventListener, options: AddEventListenerOptions = {}) => {
    target.addEventListener(type, listener, options); listeners.push([target, type, listener, options]);
  };
  // Pinch zoom (two fingers), Safari gesture events and ctrl+wheel / trackpad zoom.
  on(document, 'touchmove', (event) => { if ((event as TouchEvent).touches.length > 1) event.preventDefault(); }, { passive: false });
  on(document, 'gesturestart', (event) => event.preventDefault(), { passive: false });
  on(window, 'wheel', (event) => { if ((event as WheelEvent).ctrlKey) event.preventDefault(); }, { passive: false });
  on(window, 'keydown', (event) => {
    const key = event as KeyboardEvent;
    if ((key.ctrlKey || key.metaKey) && ['+', '-', '=', '0'].includes(key.key)) key.preventDefault();
  });
  // Long-press menus and image dragging, except inside text fields.
  on(document, 'contextmenu', (event) => { if (!isEditable(event.target)) event.preventDefault(); });
  on(document, 'dragstart', (event) => { if (!isEditable(event.target)) event.preventDefault(); });
  on(document, 'selectstart', (event) => { if (!isEditable(event.target)) event.preventDefault(); });
  // Keep the focused field visible above the virtual keyboard once the viewport resized.
  on(document, 'focusin', (event) => {
    if (!isEditable(event.target)) return;
    const field = event.target as HTMLElement;
    window.setTimeout(() => { if (document.activeElement === field) field.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 280);
  });

  // Browser Back / edge swipe in a PWA: route it to the kiosk back stack instead of
  // leaving. The Android shell intercepts Back natively and never navigates history.
  const guardState = { rofeKioskGuard: true };
  history.pushState(guardState, '');
  const onPopState = () => { handleBack(); history.pushState(guardState, ''); };
  on(window, 'popstate', onPopState);

  return () => {
    for (const [target, type, listener, options] of listeners) target.removeEventListener(type, listener, options);
    document.documentElement.classList.remove('kiosk-mode');
    if (meta && previousViewport !== undefined) meta.content = previousViewport;
  };
}
