import { useRef, useState } from 'react';
export function useAsyncAction() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar los cambios. Intenta de nuevo.'); }
    finally { running.current = false; setBusy(false); }
  };
  return { busy, error, run };
}
