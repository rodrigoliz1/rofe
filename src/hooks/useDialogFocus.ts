import { useEffect, useRef } from 'react';

export function useDialogFocus(onEscape?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const escapeRef = useRef(onEscape);
  useEffect(() => { escapeRef.current = onEscape; }, [onEscape]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter((node) => node.getClientRects().length > 0);
    if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); escapeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const targets = focusable();
      const first = targets[0]; const last = targets.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', handler);
    return () => { dialog.removeEventListener('keydown', handler); if (previous?.isConnected) previous.focus(); };
  }, []);
  return ref;
}
