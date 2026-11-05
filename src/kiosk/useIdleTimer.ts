import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'] as const;

/**
 * Calls onIdle once after `timeoutMs` without interaction. Any touch, key or input
 * restarts the countdown. Activity is tracked in refs so touches never re-render.
 */
export function useIdleTimer(enabled: boolean, timeoutMs: number, onIdle: () => void): void {
  const callback = useRef(onIdle);
  useEffect(() => { callback.current = onIdle; });
  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(() => callback.current(), timeoutMs);
    const restart = () => { window.clearTimeout(timer); timer = window.setTimeout(() => callback.current(), timeoutMs); };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, restart, { capture: true, passive: true });
    window.addEventListener('scroll', restart, { capture: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, restart, { capture: true });
      window.removeEventListener('scroll', restart, { capture: true });
    };
  }, [enabled, timeoutMs]);
}
