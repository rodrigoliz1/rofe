import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CartItem, Order } from '../types';
import { apiJson } from '../services/api';
import { clearCheckout } from '../services/checkout';
import { useCheckout } from '../hooks/useCheckout';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { UiIcon } from './UiIcon';
import { PaymentOutcomeIcon } from './PaymentOutcomeIcon';
import { usePaymentFeedback } from '../hooks/usePaymentFeedback';
import { useBackHandler } from '../kiosk/backStack';
import { vibrate } from '../kiosk/nativeBridge';

interface CheckoutModalProps {
  total: number; cartItems: CartItem[]; orders: Order[];
  onPaymentSuccess: (orderId: string, customerName: string) => void;
  onClose: () => void;
  /** Self-service terminal: no staff discount, automatic return to the welcome screen. */
  kiosk?: { confirmationSeconds: number; haptics: boolean };
  /** True while a payment is in flight and the session must not be reset by inactivity. */
  onLockChange?: (locked: boolean) => void;
}

export function CheckoutModal({ total, cartItems, orders, onPaymentSuccess, onClose, kiosk, onLockChange }: CheckoutModalProps) {
  const payment = useCheckout(cartItems, total, orders);
  const { draft, setDraft, step, setStep, error, setError, busy, offline } = payment;
  const outcome = step === 'success' || step === 'cash' ? 'success' : step === 'failed' ? 'failure' : null;
  const feedback = usePaymentFeedback(outcome, draft.operationId);
  const safeToClose = !draft.submitted || step === 'cancelled';
  const dialogRef = useDialogFocus(safeToClose ? onClose : undefined);
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED' | 'COURTESY'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [authorizing, setAuthorizing] = useState(false);
  const amount = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(draft.total);
  const folio = draft.order?.folio ?? `R-${draft.operationId.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const finish = () => { clearCheckout(); onPaymentSuccess(draft.order?.id ?? draft.operationId, draft.customerName); };
  const completed = step === 'success' || step === 'cash';
  const locked = draft.submitted && step !== 'cancelled' && !completed;
  useEffect(() => { onLockChange?.(locked); }, [locked, onLockChange]);
  useEffect(() => () => onLockChange?.(false), [onLockChange]);
  // Back closes the dialog only when no payment is in flight; otherwise it is ignored.
  useBackHandler(true, () => { if (safeToClose) onClose(); else if (completed && kiosk) finish(); return true; });
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!kiosk || !completed) { setRemaining(null); return; }
    vibrate([40, 60, 40], kiosk.haptics);
    const deadline = Date.now() + kiosk.confirmationSeconds * 1000;
    setRemaining(kiosk.confirmationSeconds);
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [kiosk, completed]);
  const finishedRef = useRef(false);
  useEffect(() => { if (remaining === 0 && !finishedRef.current) { finishedRef.current = true; finish(); } });
  const authorizeDiscount = async (event: FormEvent) => {
    event.preventDefault(); if (authorizing) return;
    setAuthorizing(true); setError('');
    try {
      const value = discountType === 'COURTESY' ? 0 : Number(discountValue);
      const result = await apiJson<{ token: string }>('/api/orders/discount-authorization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: draft.operationId, type: discountType, value, reason: discountReason, email: managerEmail, password: managerPassword }) });
      payment.setDiscountToken(result.token); setManagerPassword('');
      setDraft({ ...draft, total: discountType === 'COURTESY' ? 0 : discountType === 'PERCENTAGE' ? total * (1 - value / 100) : Math.max(0, total - value) });
      setStep('method');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos autorizar el descuento.'); }
    finally { setAuthorizing(false); }
  };
  return <div className="checkout-backdrop">
    <div ref={dialogRef} className="checkout-dialog payment-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabIndex={-1}>
      {safeToClose && <button className="checkout-close-x" onClick={onClose} aria-label="Cerrar pago">×</button>}
      <div className="payment-heading"><span>ROFÉ · Tu pedido</span><strong>{amount} <small>MXN</small></strong></div>
      {error && <p className="payment-notice" role="alert">{error}</p>}
      {step === 'name' && <form className="name-form" onSubmit={(event) => { event.preventDefault(); if (draft.customerName.trim()) { setError(''); setStep('method'); } }}>
        <h2 id="checkout-title">¿A nombre de quién?</h2>
        <p className="checkout-step-text">Te llamaremos cuando tu pedido esté listo.</p>
        <label htmlFor="customer-name">Tu nombre</label>
        <input id="customer-name" className="name-input" placeholder="Ingresa tu nombre..." value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} maxLength={24} required autoComplete={kiosk ? 'off' : 'given-name'} autoCapitalize="words" spellCheck={false} enterKeyHint="next" autoFocus />
        <button className="confirm-name-btn" type="submit" disabled={!draft.customerName.trim()}>CONTINUAR</button>
      </form>}
      {step === 'method' && <div className="checkout-step-content width-100">
        <h2 id="checkout-title">Elige cómo pagar</h2>
        <p className="checkout-step-text">Ya casi está, {draft.customerName}.</p>
        <div className="payment-methods-grid">
          <button className="payment-method-btn" onClick={() => void payment.submit('card')} disabled={busy || !navigator.onLine}>
            <UiIcon name="card" size={32} /><span className="payment-method-label">TARJETA DE DÉBITO/CRÉDITO</span><span className="payment-method-desc">Acerca o inserta tu tarjeta en Mercado Pago Point.</span>
          </button>
          <button className="payment-method-btn" onClick={() => void payment.submit('cash')} disabled={busy}>
            <UiIcon name="cash" size={32} /><span className="payment-method-label">PAGO EN EFECTIVO</span><span className="payment-method-desc">Registra el pedido y paga en el mostrador.</span>
          </button>
        </div>
        {!navigator.onLine && <p className="payment-notice">Sin internet: sólo podemos guardar pedidos en efectivo.</p>}
        {!kiosk && <button type="button" className="checkout-secondary-action" onClick={() => { setError(''); setStep('discount'); }}>{payment.discountToken ? 'Descuento autorizado' : 'Aplicar descuento con autorización'}</button>}
        <button type="button" className="checkout-secondary-action" onClick={() => setStep('name')}>Cambiar nombre</button>
      </div>}
      {step === 'discount' && <form onSubmit={authorizeDiscount} className="name-form">
        <h2 id="checkout-title">Autorizar descuento</h2>
        <p className="checkout-step-text">Un administrador o gerente debe autorizar esta operación.</p>
        <label htmlFor="discount-type">Tipo de descuento</label>
        <select id="discount-type" className="name-input" value={discountType} onChange={(event) => setDiscountType(event.target.value as typeof discountType)}><option value="PERCENTAGE">Porcentaje</option><option value="FIXED">Importe fijo</option><option value="COURTESY">Cortesía total</option></select>
        {discountType !== 'COURTESY' && <><label htmlFor="discount-value">{discountType === 'PERCENTAGE' ? 'Porcentaje' : 'Importe MXN'}</label><input id="discount-value" className="name-input" type="number" min="0.01" max={discountType === 'PERCENTAGE' ? 100 : total} step="0.01" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} required /></>}
        <label htmlFor="discount-reason">Motivo</label><input id="discount-reason" className="name-input" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} minLength={5} maxLength={240} required />
        <label htmlFor="manager-email">Correo del responsable</label><input id="manager-email" className="name-input" type="email" autoComplete="username" value={managerEmail} onChange={(event) => setManagerEmail(event.target.value)} required />
        <label htmlFor="manager-password">Contraseña</label><input id="manager-password" className="name-input" type="password" autoComplete="current-password" value={managerPassword} onChange={(event) => setManagerPassword(event.target.value)} required />
        <button type="submit" className="confirm-name-btn" disabled={authorizing}>{authorizing ? 'Verificando…' : 'Autorizar descuento'}</button>
        <button type="button" className="checkout-secondary-action" disabled={authorizing} onClick={() => setStep('method')}>Volver</button>
      </form>}
      {(step === 'connecting' || step === 'waiting') && <div className="checkout-step-content width-100">
        <div className="payment-state-icon"><UiIcon name="card" size={48} /></div>
        <h2 id="checkout-title">{step === 'connecting' ? 'Enviando tu pedido' : 'Continúa en la terminal'}</h2>
        <p className="checkout-step-text">{step === 'connecting' ? 'Conectando con Mercado Pago Point…' : 'Acerca o inserta tu tarjeta. Espera aquí hasta que confirmemos el pago.'}</p>
        <div className="payment-progress" role="status"><span className="spinner-ring height-small" />{step === 'connecting' ? 'Conectando' : 'Esperando confirmación'}</div>
        <p className="payment-reference">Pedido {folio}</p>
        {payment.simulation && <div className="simulation-actions"><p>Entorno de pruebas · no realiza cobros</p><button className="btn btn-primary" disabled={busy} onClick={() => void payment.simulate()}>Simular Pago Exitoso</button></div>}
        {step === 'waiting' && <button className="checkout-secondary-action" disabled={busy} onClick={() => void payment.submit()}>Revisar envío</button>}
        <button className="checkout-secondary-action" disabled={busy} onClick={() => void payment.cancel()}>{busy ? 'Esperando…' : 'Solicitar cancelación'}</button>
      </div>}
      {(step === 'success' || step === 'cash') && <div className="checkout-step-content width-100 payment-outcome-content" role="status">
        <PaymentOutcomeIcon outcome="success" />
        <h2 id="checkout-title">{step === 'success' ? 'PAGO APROBADO' : 'PEDIDO REGISTRADO'}</h2>
        <p className="checkout-step-text">{step === 'success' ? `Gracias, ${draft.customerName}. Tu pedido pasa a preparación.` : offline ? 'Guardado en este dispositivo. Se enviará al recuperar internet; avisa al equipo antes de pagar.' : 'Acércate al mostrador para pagar en efectivo.'}</p>
        <div className="order-ticket"><p className="ticket-label">TU NÚMERO DE PEDIDO</p><h3 className="ticket-folio">{folio}</h3><p className="ticket-client-name">{draft.customerName}</p><div className="ticket-dash" /><strong>{step === 'cash' ? 'Por pagar: ' : 'Pagado: '}{amount} MXN</strong><p className="ticket-footer">Puedes tomar una foto de este comprobante.</p></div>
        <button className="done-btn" onClick={finish}>{step === 'cash' ? 'Listo, tomé foto' : 'Entendido'}</button>
        {remaining !== null && <p className="kiosk-auto-reset" aria-live="off">Volvemos al inicio en {remaining} s</p>}
        {feedback.soundBlocked && <button type="button" className="payment-sound-replay" onClick={feedback.replaySound}>Escuchar sonido</button>}
      </div>}
      {step === 'failed' && <div className="checkout-step-content width-100 payment-outcome-content" role="status"><PaymentOutcomeIcon outcome="failure" /><h2 id="checkout-title">No pudimos completar el pago</h2><p className="checkout-step-text">Tu pedido sigue disponible. Revisa este intento antes de iniciar un nuevo cobro.</p><button className="btn btn-primary" disabled={busy} onClick={() => void payment.submit()}>Reintentar el mismo pedido</button><button className="checkout-secondary-action" disabled={busy} onClick={() => void payment.cancel()}>Cerrar intento de pago</button>{feedback.soundBlocked && <button type="button" className="payment-sound-replay" onClick={feedback.replaySound}>Escuchar sonido</button>}</div>}
      {step === 'cancelled' && <div className="checkout-step-content width-100"><h2 id="checkout-title">Intento cerrado</h2><p className="checkout-step-text">Puedes volver a tu pedido y elegir otro método de pago.</p><button className="btn btn-primary" onClick={onClose}>Volver al pedido</button></div>}
    </div>
  </div>;
}
