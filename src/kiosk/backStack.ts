import { useEffect, useRef } from 'react';

/** A handler returns true when it consumed Back (closed a dialog, went up a level…). */
type BackHandler = () => boolean;
const stack: Array<{ current: BackHandler }> = [];

/** Runs the most recently registered handler first, like a stack of screens. */
export function handleBack(): boolean {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].current()) return true;
  }
  return false;
}

export function useBackHandler(active: boolean, handler: BackHandler): void {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => ref.current() };
    stack.push(entry);
    return () => { const index = stack.indexOf(entry); if (index >= 0) stack.splice(index, 1); };
  }, [active]);
}
