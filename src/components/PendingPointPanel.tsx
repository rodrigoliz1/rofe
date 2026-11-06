import { useEffect, useState } from 'react';
import { apiJson } from '../services/api';
interface PendingPoint { id: string; folio: string; total: number; createdAt: string; hasProviderReference: boolean; attempts: number; outcome: string; lastAttemptAt?: string }
interface PointState { available: boolean; enabled: boolean; orders: PendingPoint[]; unassigned: Array<{ id: string; folio: string; total: number; paidAt: string }>; limit: number }
const outcomes: Record<string, string> = { PENDING_PROVIDER: 'Esperando confirmación', MISSING_REFERENCE: 'Referencia pendiente de recuperación', PROVIDER_ERROR: 'Consulta no confirmada', REFERENCE_MISMATCH: 'Revisar referencia', AMOUNT_MISMATCH: 'Revisar importe', LOCAL_CONFIRMATION_ERROR: 'Pago consultado; registro local requiere revisión', RESOLVED: 'Resuelto' };
export function PendingPointPanel() {
  const [state, setState] = useState<PointState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => { setError(''); try { setState(await apiJson('/api/admin/payments/point')); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos consultar los pagos.'); } };
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 30_000); return () => clearInterval(timer); }, []);
  const reconcile = async (order: PendingPoint) => {
    const providerOrderId = order.hasProviderReference ? undefined : window.prompt('Identificador de la orden verificado en Mercado Pago. Se comprobarán referencia e importe; no se enviará otro cobro.');
    if (providerOrderId === null || providerOrderId === '') return;
    setBusy(true); setError('');
    try { await apiJson(`/api/admin/payments/point/${encodeURIComponent(order.id)}/reconcile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerOrderId }) }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos confirmar el pago.'); }
    finally { setBusy(false); }
  };
  return <section className="terminal-panel" aria-label="Conciliación de pagos Point"><h3>Pagos Point pendientes</h3>
    <p>Consulta y recuperación de órdenes existentes. Nunca reenvíes un cobro con resultado incierto.</p>
    {state && <><p role="status">{!state.available ? 'Migración de conciliación pendiente.' : state.enabled ? 'Conciliación programada habilitada en el servidor; confirma el estado del programador en operación.' : 'Conciliación programada deshabilitada.'}</p>
      {Boolean(state.unassigned?.length) && <aside><h4>Confirmados fuera de turno</h4><p>Estos pagos se confirmaron sin una caja abierta. Figuran en ventas por fecha de confirmación y requieren revisión; no se reasignan a un corte cerrado.</p>{state.unassigned.map(order => <p key={order.id}>{order.folio} · ${order.total.toFixed(2)} · {new Date(order.paidAt).toLocaleString('es-MX')}</p>)}</aside>}
      {!state.orders.length && <p>No hay pedidos Point pendientes.</p>}
      {state.orders.map(order => <article key={order.id} style={{ padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}><strong>{order.folio} · ${order.total.toFixed(2)}</strong><p>{outcomes[order.outcome] ?? 'Requiere revisión'} · {new Date(order.createdAt).toLocaleString('es-MX')} · {order.attempts} consultas</p>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void reconcile(order)}>{order.hasProviderReference ? 'Consultar estado' : 'Recuperar referencia verificada'}</button></article>)}
      {state.orders.length === state.limit && <p>Se muestran los {state.limit} pedidos más antiguos. Resuelve las excepciones antes de continuar.</p>}</>}
    <button className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>Actualizar pendientes</button>
    {error && <p role="alert" className="inline-feedback error">{error}</p>}
  </section>;
}
