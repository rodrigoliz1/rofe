import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { Order } from '../types';
import { apiJson } from '../services/api';
import { calculateBestPossibleChange, calculateOptimalChange, DENOM_VALUES, orderAmountDue } from '../utils/cash';
import '../styles/cash-panel.css';

export interface ChangeVoucher { code: string; amount: number; balance: number; status: string; createdAt: string; qr: string }

const money = (value: number) => `$${value.toFixed(2)}`;
const label = (key: string) => {
  const value = DENOM_VALUES[key];
  const amount = value < 1 ? `${Math.round(value * 100)}¢` : `$${value}`;
  return { amount, kind: key.startsWith('bill') ? 'Billete' : 'Moneda' };
};

/** Bills first (largest → smallest), then coins: the order the barista reads the drawer. */
const DENOMINATIONS = Object.keys(DENOM_VALUES);

interface CashPaymentPanelProps {
  order: Order;
  /** Drawer contents before this payment (from /api/cash/denominations). */
  cashInventory: Record<string, number>;
  onPaid: () => void;
  onCancelled: () => void;
  onClose: () => void;
}

type Step = 'count' | 'insufficient' | 'voucher';

/**
 * Cash collection for the barista.
 * - Tap a bill/coin tile to add one; the "−" on its side removes one. No keyboard.
 * - Summary (received / change) and Cobrar / Cerrar stay above the tiles.
 * - If the drawer cannot give the change, the customer chooses: cancel, or take a change
 *   voucher (QR + code) for what is missing, usable in a next order or paid out later.
 */
export function CashPaymentPanel({ order, cashInventory, onPaid, onCancelled, onClose }: CashPaymentPanelProps) {
  const [received, setReceived] = useState<Record<string, number>>({});
  const [step, setStep] = useState<Step>('count');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [voucher, setVoucher] = useState<{ voucher: ChangeVoucher; changeGiven: number; changeBreakdown: Record<string, number> } | null>(null);
  const [qrSvg, setQrSvg] = useState('');

  const receivedTotal = useMemo(() => Math.round(Object.entries(received).reduce((sum, [key, count]) => sum + (DENOM_VALUES[key] ?? 0) * count, 0) * 100) / 100, [received]);
  const due = orderAmountDue(order);
  const changeDue = Math.round((receivedTotal - due) * 100) / 100;
  // Change is paid from the drawer plus the bills just received.
  const available = useMemo(() => Object.fromEntries(DENOMINATIONS.map((key) => [key, (cashInventory[key] || 0) + (received[key] || 0)])), [cashInventory, received]);
  const best = useMemo(() => changeDue > 0 ? calculateBestPossibleChange(changeDue, available) : { amount: 0, changeBreakdown: {} }, [changeDue, available]);
  const shortfall = Math.round((changeDue - best.amount) * 100) / 100;

  useEffect(() => {
    if (!voucher) return;
    let active = true;
    void QRCode.toString(voucher.voucher.qr, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 260, color: { dark: '#111311', light: '#ffffff' } }).then((svg) => { if (active) setQrSvg(svg); });
    return () => { active = false; };
  }, [voucher]);

  const add = (key: string) => { setError(''); setReceived((current) => ({ ...current, [key]: Math.min(999, (current[key] || 0) + 1) })); };
  const remove = (key: string) => { setError(''); setReceived((current) => { const next = { ...current, [key]: Math.max(0, (current[key] || 0) - 1) }; if (!next[key]) delete next[key]; return next; }); };

  const pay = async (voucherAmount: number, changeBreakdown: Record<string, number>, changeAmount: number) => {
    setBusy(true); setError('');
    try {
      const result = await apiJson<{ order: Order; voucher?: ChangeVoucher }>(`/api/orders/${encodeURIComponent(order.id)}/cash-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedDenominations: received, changeDenominations: changeBreakdown, receivedAmount: receivedTotal, changeAmount, ...(voucherAmount > 0 ? { voucherAmount } : {}) }),
      });
      if (voucherAmount > 0 && result.voucher) { setVoucher({ voucher: result.voucher, changeGiven: changeAmount, changeBreakdown }); setStep('voucher'); }
      else onPaid();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos registrar el cobro.');
    } finally { setBusy(false); }
  };

  const charge = () => {
    if (busy) return;
    if (receivedTotal <= 0 && due > 0) { setError('Toca los billetes y monedas que entregó el cliente.'); return; }
    if (changeDue < 0) { setError(`Faltan ${money(-changeDue)} MXN`); return; }
    const exact = calculateOptimalChange(changeDue, available);
    if (exact.success) { void pay(0, exact.changeBreakdown, changeDue); return; }
    setStep('insufficient');
  };

  const cancelTransaction = async () => {
    setBusy(true); setError('');
    try {
      await apiJson(`/api/orders/${encodeURIComponent(order.id)}/cancel-insufficient-change`, { method: 'POST' });
      onCancelled();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cancelar el pedido.');
    } finally { setBusy(false); }
  };

  if (step === 'voucher' && voucher) {
    return <section className="cash-panel cash-voucher" aria-labelledby="cash-voucher-title">
      <h3 id="cash-voucher-title">Cupón de cambio emitido</h3>
      {voucher.changeGiven > 0 && <p className="cash-voucher-give">Entrega al cliente <strong>{money(voucher.changeGiven)}</strong> en efectivo{breakdownText(voucher.changeBreakdown)}.</p>}
      <div className="cash-voucher-ticket">
        <p className="cash-voucher-kicker">ROFÉ · CUPÓN DE CAMBIO</p>
        <strong className="cash-voucher-amount">{money(voucher.voucher.amount)} MXN</strong>
        {qrSvg ? <div className="cash-voucher-qr" role="img" aria-label={`Código QR del cupón ${voucher.voucher.code}`} dangerouslySetInnerHTML={{ __html: qrSvg }} /> : <div className="cash-voucher-qr" aria-hidden="true" />}
        <p className="cash-voucher-code" aria-label={`Código ${voucher.voucher.code.split('').join(' ')}`}>{voucher.voucher.code}</p>
        <p className="cash-voucher-help">Toma una foto y guarda este código. Úsalo en tu próximo pedido (escríbelo al pagar) o pide tu cambio en barra cuando haya efectivo.</p>
      </div>
      <button type="button" className="btn btn-primary cash-panel-wide" onClick={onPaid}>Listo, el cliente tomó la foto</button>
    </section>;
  }

  if (step === 'insufficient') {
    return <section className="cash-panel cash-insufficient" role="alertdialog" aria-labelledby="cash-insufficient-title" aria-describedby="cash-insufficient-text">
      <h3 id="cash-insufficient-title">Cambio insuficiente en caja</h3>
      <p id="cash-insufficient-text">El cambio es de <strong>{money(changeDue)}</strong>, pero la caja solo puede entregar <strong>{money(best.amount)}</strong>. Faltan <strong>{money(shortfall)}</strong>.</p>
      <p>Pregunta al cliente si desea cancelar su pedido o recibir un cupón por {money(shortfall)} para su próximo pedido o para regresar más tarde por su cambio.</p>
      {error && <p className="inline-feedback error" role="alert">{error}</p>}
      <div className="cash-panel-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void pay(shortfall, best.changeBreakdown, best.amount)}>{busy ? 'Registrando…' : `Emitir cupón por ${money(shortfall)}`}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void cancelTransaction()}>Cancelar transacción</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStep('count')}>Volver a contar</button>
      </div>
    </section>;
  }

  return <section className="cash-panel" aria-label="Pago en efectivo">
    <div className="cash-panel-summary" aria-live="polite">
      <div><span>{order.voucherAmount ? 'Por cobrar' : 'Total'}</span><strong>{money(due)}</strong></div>
      <div><span>Recibido</span><strong data-testid="cash-received">{money(receivedTotal)}</strong></div>
      <div className={changeDue < 0 ? 'is-missing' : ''}><span>{changeDue < 0 ? 'Falta' : 'Cambio'}</span><strong data-testid="cash-change">{money(Math.abs(changeDue))}</strong></div>
    </div>
    {Boolean(order.voucherAmount) && <p className="cash-panel-hint">Total {money(order.total)} · pagado con cupón {money(order.voucherAmount ?? 0)}</p>}
    {error && <p className="inline-feedback error" role="alert">{error}</p>}
    <div className="cash-panel-actions">
      <button type="button" className="btn btn-primary" disabled={busy} onClick={charge}>{busy ? 'Cobrando…' : 'Cobrar'}</button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cerrar</button>
      {receivedTotal > 0 && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setReceived({})}>Borrar conteo</button>}
    </div>
    <p className="cash-panel-hint">Toca un billete o moneda por cada pieza que entregó el cliente.</p>
    <div className="cash-tiles">
      {DENOMINATIONS.map((key) => {
        const count = received[key] || 0;
        const { amount, kind } = label(key);
        return <div key={key} className={`cash-tile${count ? ' has-count' : ''}${key.startsWith('bill') ? ' is-bill' : ' is-coin'}`}>
          <button type="button" className="cash-tile-add" onClick={() => add(key)} aria-label={`${kind} de ${amount}: ${count} recibidos. Agregar uno`}>
            <span className="cash-tile-kind">{kind}</span>
            <span className="cash-tile-amount">{amount}</span>
            {count > 0 && <span className="cash-tile-count" aria-hidden="true">×{count}</span>}
          </button>
          {count > 0 && <button type="button" className="cash-tile-minus" onClick={() => remove(key)} aria-label={`Quitar un ${kind.toLowerCase()} de ${amount}`}>−</button>}
        </div>;
      })}
    </div>
  </section>;
}

function breakdownText(breakdown: Record<string, number>) {
  const parts = Object.entries(breakdown).filter(([, count]) => count > 0).map(([key, count]) => `${count} × ${label(key).amount}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}
