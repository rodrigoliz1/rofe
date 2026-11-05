import { useEffect, useRef, type PointerEvent } from 'react';

/**
 * Discreet admin entry: keep a finger on the element for `ms`. Moving away or lifting
 * the finger cancels it, so normal taps and scrolling never trigger it.
 */
export function useLongPress(onLongPress: () => void, ms = 5_000) {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const callback = useRef(onLongPress);
  useEffect(() => { callback.current = onLongPress; });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const cancel = () => { window.clearTimeout(timer.current); timer.current = undefined; origin.current = null; };
  return {
    onPointerDown: (event: PointerEvent) => {
      cancel();
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => { cancel(); callback.current(); }, ms);
    },
    onPointerMove: (event: PointerEvent) => {
      if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 24) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: { preventDefault(): void }) => event.preventDefault(),
  };
}
