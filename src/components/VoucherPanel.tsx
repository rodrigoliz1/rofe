import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiJson } from '../services/api';
import { calculateOptimalChange, DENOM_VALUES } from '../utils/cash';
import { createOperationId } from '../utils/id';
import type { ChangeVoucher } from './CashPaymentPanel';
import '../styles/cash-panel.css';
import { useBackHandler } from '../kiosk/backStack';
import { voucherCodeFromScan } from '../utils/voucher';

const money = (value: number) => `$${value.toFixed(2)}`;
const STATUS: Record<string, string> = { ACTIVE: 'Vigente', REDEEMED: 'Ya utilizado', CANCELLED: 'Cancelado' };


/**
 * Barista: look up a change voucher by code or QR and pay its balance in cash when the
 * drawer has the exact denominations. Every payout is a single idempotent operation.
 */
export function VoucherPanel({ cashInventory, onCashChanged }: { cashInventory: Record<string, number>; onCashChanged: () => void }) {
  const [code, setCode] = useState('');
  const [voucher, setVoucher] = useState<ChangeVoucher | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  useBackHandler(scanning, () => { setScanning(false); return true; });
  const operation = useRef(createOperationId());

  const lookup = async (raw: string) => {
    const value = voucherCodeFromScan(raw);
    if (!value) return;
    setBusy(true); setError(''); setMessage(''); setVoucher(null);
    try {
      const result = await apiJson<{ voucher: ChangeVoucher }>(`/api/vouchers/${encodeURIComponent(value)}`);
      setVoucher(result.voucher); setCode(result.voucher.code);
      operation.current = createOperationId();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No encontramos ese cupón.'); }
    finally { setBusy(false); }
  };

  const payout = voucher && voucher.status === 'ACTIVE' ? calculateOptimalChange(voucher.balance, cashInventory) : null;

  const pay = async () => {
    if (!voucher || !payout?.success) return;
    setBusy(true); setError('');
    try {
      const result = await apiJson<{ voucher: ChangeVoucher; paid: number }>(`/api/vouchers/${encodeURIComponent(voucher.code)}/redeem-cash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: operation.current, denominations: payout.changeBreakdown }),
      });
      setVoucher(result.voucher);
      setMessage(`Entrega ${money(voucher.balance)} al cliente${breakdown(payout.changeBreakdown)}. El cupón quedó utilizado.`);
      onCashChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos pagar el cupón.'); }
    finally { setBusy(false); }
  };

  return <section className="voucher-panel" aria-labelledby="voucher-panel-title">
    <h2 id="voucher-panel-title">Cupones de cambio</h2>
    <p className="cash-panel-hint">Escanea el QR del cliente o escribe su código para entregarle el cambio pendiente.</p>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); void lookup(code); }}>
      <label className="sr-only" htmlFor="voucher-code">Código del cupón</label>
      <input id="voucher-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="XXXX-XXXX-XX" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={24} />
      <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>Buscar</button>
      <button type="button" className="btn btn-secondary" onClick={() => setScanning((value) => !value)}>{scanning ? 'Cerrar cámara' : 'Escanear QR'}</button>
    </form>
    {scanning && <QrScanner onCode={(value) => { setScanning(false); setCode(voucherCodeFromScan(value)); void lookup(value); }} onError={(text) => { setScanning(false); setError(text); }} />}
    {error && <p className="inline-feedback error" role="alert">{error}</p>}
    {voucher && <div className="voucher-card" data-testid="voucher-card">
      <span className="voucher-status">{STATUS[voucher.status] ?? voucher.status} · {voucher.code}</span>
      <strong>{money(voucher.balance)} MXN</strong>
      <span>Emitido por {money(voucher.amount)} el {new Date(voucher.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
      {voucher.status === 'ACTIVE' && payout?.success && <button type="button" className="btn btn-primary cash-panel-wide" disabled={busy} onClick={() => void pay()}>{busy ? 'Registrando…' : `Entregar ${money(voucher.balance)} en efectivo`}</button>}
      {voucher.status === 'ACTIVE' && payout && !payout.success && <p className="inline-feedback error" role="alert">Cambio insuficiente en caja para pagar este cupón. El cliente puede usarlo en su próximo pedido o volver más tarde.</p>}
    </div>}
    {message && <p className="inline-feedback success" role="status">{message}</p>}
  </section>;
}

function breakdown(changeBreakdown: Record<string, number>) {
  const parts = Object.entries(changeBreakdown).filter(([, count]) => count > 0).map(([key, count]) => `${count} × $${DENOM_VALUES[key]}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/** Camera QR reader. jsQR is loaded only when the camera opens. */
function QrScanner({ onCode, onError }: { onCode: (value: string) => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const { default: jsQR } = await import('jsqr');
        if (stopped) return;
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        stream = media;
        if (stopped || !video.current) { media.getTracks().forEach(track => track.stop()); return; }
        video.current.srcObject = media;
        await video.current.play();
        const tick = () => {
          if (stopped || !video.current || !context) return;
          const { videoWidth: width, videoHeight: height } = video.current;
          if (width && height) {
            canvas.width = width; canvas.height = height;
            context.drawImage(video.current, 0, 0, width, height);
            const result = jsQR(context.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: 'dontInvert' });
            if (result?.data) { onCode(result.data); return; }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        stream?.getTracks().forEach(track => track.stop());
        if (!stopped) onError('No pudimos abrir la cámara. Escribe el código del cupón.');
      }
    })();
    const pause = () => { if (document.visibilityState === 'hidden' || eventNativePause) { stop(); onError('Escaneo pausado. Vuelve a abrir la cámara para continuar.'); } };
    let eventNativePause = false;
    const nativePause = () => { eventNativePause = true; pause(); };
    const stop = () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); };
    document.addEventListener('visibilitychange', pause); window.addEventListener('rofe:native-pause', nativePause);
    return () => { stop(); document.removeEventListener('visibilitychange', pause); window.removeEventListener('rofe:native-pause', nativePause); };
    // Callbacks are stable for the lifetime of a scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="voucher-scanner"><video ref={video} muted playsInline aria-label="Cámara para escanear el QR del cupón" /><span className="voucher-scanner-frame" aria-hidden="true" /></div>;
}
