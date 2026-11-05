import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson, getPrincipal } from '../services/api';
import { getPendingOperations, markOperationFailed, markOperationsSynced, markOperationsSyncing, outboxCount, retryFailedOperations } from '../services/offline';

export function useOutbox(ready: boolean) {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const syncing = useRef(false);
  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      setPending(await outboxCount());
      if (!ready || !navigator.onLine || getPrincipal()?.role !== 'POS_DEVICE') return;
      const operations = await getPendingOperations();
      let failed = false;
      // An invalid operation cannot block other customers' orders.
      for (const operation of operations) {
        try {
          await markOperationsSyncing([operation]);
          const result = await apiJson<{ operationIds: string[] }>('/api/orders/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: [operation] }) });
          await markOperationsSynced(result.operationIds);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : 'No pudimos sincronizar este pedido.';
          await markOperationFailed(operation, message); setError(message); failed = true;
        }
      }
      if (!failed) setError('');
      setPending(await outboxCount());
    } catch { setError('No pudimos acceder a los pedidos guardados. Revisa el almacenamiento del dispositivo.'); }
    finally { syncing.current = false; }
  }, [ready]);
  const retry = useCallback(async () => { await retryFailedOperations(); await sync(); }, [sync]);
  useEffect(() => {
    void sync();
    const listener = () => { void sync(); };
    window.addEventListener('online', listener); window.addEventListener('rofe-outbox-changed', listener);
    const timer = window.setInterval(listener, 30_000);
    return () => { window.clearInterval(timer); window.removeEventListener('online', listener); window.removeEventListener('rofe-outbox-changed', listener); };
  }, [sync]);
  return { pending, error, retry };
}
