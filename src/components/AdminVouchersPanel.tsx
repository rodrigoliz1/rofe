import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../services/api';
import '../styles/cash-panel.css';

interface Redemption { kind: 'CASH' | 'ORDER'; amount: number; orderId?: string; status: 'APPLIED' | 'RELEASED'; userId?: string; createdAt: string }
interface AdminVoucher { code: string; amount: number; balance: number; status: 'ACTIVE' | 'REDEEMED' | 'CANCELLED'; createdAt: string; orderId?: string; createdBy?: string; cancelledReason?: string; cancelledAt?: string; redemptions: Redemption[] }
interface Summary { outstanding: number; activeCount: number; reservedInPendingOrders: number; issued: number; paidOutInCash: number; appliedToOrders: number; cancelled: number }

const money = (value: number) => `$${value.toFixed(2)}`;
const STATUS: Record<string, string> = { ACTIVE: 'Pendiente de usar', REDEEMED: 'Utilizado', CANCELLED: 'Cancelado' };
const when = (value?: string) => value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/**
 * Change vouchers as a liability: what ROFÉ owes customers. History of every voucher with
 * its issue, uses (orders), cash payouts and cancellations. Only ADMIN / MANAGER.
 */
export function AdminVouchersPanel() {
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'REDEEMED' | 'CANCELLED'>('');
  const [data, setData] = useState<{ summary: Summary; vouchers: AdminVoucher[] } | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try { setError(''); setData(await apiJson(`/api/admin/vouchers${status ? `?status=${status}` : ''}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos cargar los cupones.'); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  const cancel = async (code: string) => {
    try {
      await apiJson(`/api/admin/vouchers/${encodeURIComponent(code)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      setCancelling(null); setReason(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos cancelar el cupón.'); }
  };

  return <div className="admin-vouchers">
    {error && <p className="inline-feedback error" role="alert">{error}</p>}
    {data && <div className="metrics-row" aria-label="Resumen de cupones">
      <div className="metric-card"><span className="metric-label">Pasivo pendiente (se debe a clientes)</span><strong className="metric-value" data-testid="voucher-outstanding">{money(data.summary.outstanding)}</strong><span>{data.summary.activeCount} cupones vigentes</span></div>
      <div className="metric-card"><span className="metric-label">Reservado en pedidos pendientes</span><strong className="metric-value">{money(data.summary.reservedInPendingOrders)}</strong></div>
      <div className="metric-card"><span className="metric-label">Emitido (histórico)</span><strong className="metric-value">{money(data.summary.issued)}</strong></div>
      <div className="metric-card"><span className="metric-label">Pagado en efectivo · aplicado a pedidos</span><strong className="metric-value">{money(data.summary.paidOutInCash)} · {money(data.summary.appliedToOrders)}</strong></div>
    </div>}
    <div className="voucher-panel" style={{ padding: 0, maxWidth: 'none' }}>
      <label htmlFor="voucher-status-filter">Estado</label>
      <select id="voucher-status-filter" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
        <option value="">Todos</option><option value="ACTIVE">Pendientes de usar</option><option value="REDEEMED">Utilizados</option><option value="CANCELLED">Cancelados</option>
      </select>
    </div>
    <table className="admin-table" aria-label="Historial de cupones">
      <thead><tr><th>Código</th><th>Estado</th><th>Emitido</th><th>Saldo</th><th>Pedido origen</th><th>Movimientos</th><th /></tr></thead>
      <tbody>
        {data?.vouchers.map((voucher) => <tr key={voucher.code}>
          <td style={{ fontFamily: 'ui-monospace, monospace' }}>{voucher.code}</td>
          <td>{STATUS[voucher.status]}{voucher.cancelledReason && <><br /><small>{voucher.cancelledReason} · {when(voucher.cancelledAt)}</small></>}</td>
          <td>{money(voucher.amount)}<br /><small>{when(voucher.createdAt)}</small></td>
          <td>{money(voucher.balance)}</td>
          <td><small>{voucher.orderId}</small></td>
          <td>{voucher.redemptions.length === 0 ? '—' : voucher.redemptions.map((entry, index) => <div key={index}><small>{entry.kind === 'CASH' ? 'Pago en efectivo' : `Pedido ${entry.orderId}`} · {money(entry.amount)}{entry.status === 'RELEASED' ? ' · devuelto al cupón' : ''} · {when(entry.createdAt)}</small></div>)}</td>
          <td>{voucher.status === 'ACTIVE' && (cancelling === voucher.code
            ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><input aria-label={`Motivo para cancelar ${voucher.code}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo" /><button type="button" className="btn btn-secondary" disabled={reason.trim().length < 5} onClick={() => void cancel(voucher.code)}>Confirmar</button><button type="button" className="btn btn-ghost" onClick={() => setCancelling(null)}>No</button></div>
            : <button type="button" className="btn btn-ghost" onClick={() => { setCancelling(voucher.code); setReason(''); }}>Cancelar cupón</button>)}</td>
        </tr>)}
        {data && data.vouchers.length === 0 && <tr><td colSpan={7}>No hay cupones.</td></tr>}
      </tbody>
    </table>
  </div>;
}
