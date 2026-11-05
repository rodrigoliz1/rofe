import { useSyncExternalStore } from 'react';

const isTextField = (element: Element | null) => element instanceof HTMLElement && element.matches('input:not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]');

/**
 * Stacked (portrait) vs. side-by-side (landscape) kiosk layout.
 *
 * A CSS orientation query is not enough: when the Android keyboard opens in portrait
 * the viewport becomes wider than tall and the layout would flip to landscape while
 * the customer types. The decision therefore follows the physical screen orientation,
 * falling back to the viewport only when no text field has focus.
 */
export function computeStacked(): boolean {
  const width = window.innerWidth;
  if (width < 760) return true;
  // screen.width/height follow the device rotation on Android Chrome and WebView.
  const screenPortrait = window.screen.height > window.screen.width;
  const viewportPortrait = window.innerHeight > width;
  return screenPortrait && (viewportPortrait || isTextField(document.activeElement));
}

function subscribe(notify: () => void): () => void {
  const later = () => window.setTimeout(notify, 0);
  window.addEventListener('resize', notify);
  window.screen?.orientation?.addEventListener?.('change', notify);
  document.addEventListener('focusin', later);
  document.addEventListener('focusout', later);
  return () => {
    window.removeEventListener('resize', notify);
    window.screen?.orientation?.removeEventListener?.('change', notify);
    document.removeEventListener('focusin', later);
    document.removeEventListener('focusout', later);
  };
}

export function useStackedLayout(): boolean {
  return useSyncExternalStore(subscribe, computeStacked, () => false);
}
