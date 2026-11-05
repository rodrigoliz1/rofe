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

/** Registers a handler on top of the stack; the returned function removes it. */
export function pushBackHandler(handler: BackHandler): () => void {
  const entry = { current: handler };
  stack.push(entry);
  return () => { const index = stack.indexOf(entry); if (index >= 0) stack.splice(index, 1); };
}

export function useBackHandler(active: boolean, handler: BackHandler): void {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  useEffect(() => active ? pushBackHandler(() => ref.current()) : undefined, [active]);
}
