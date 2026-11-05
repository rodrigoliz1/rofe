import { useEffect, useRef, useState } from 'react';
import type { CartItem, Order } from '../types';
import { ApiError, ConnectionError, apiJson } from '../services/api';
import { enqueueCashOrder, getDeviceCredentials } from '../services/offline';
import { clearCheckout, readCheckout, saveCheckout, type CheckoutDraft } from '../services/checkout';
import { createOperationId } from '../utils/id';
import { orderAmountDue } from '../utils/cash';

export type PaymentStep = 'name' | 'method' | 'discount' | 'connecting' | 'waiting' | 'success' | 'cash' | 'failed' | 'cancelled';
export function useCheckout(cartItems: CartItem[], total: number, orders: Order[]) {
  const [draft, setDraft] = useState<CheckoutDraft>(() => readCheckout() ?? { operationId: createOperationId(), cartItems, total, customerName: '', paymentMethod: 'card', submitted: false });
  const [step, setStep] = useState<PaymentStep>(draft.submitted ? 'waiting' : 'name');
  const [error, setError] = useState('');
  const [simulation, setSimulation] = useState(draft.simulation ?? false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [discountToken, setDiscountToken] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const acceptOrder = (order: Order) => {
    setDraft((previous) => {
      const next = { ...previous, order, total: orderAmountDue(order) };
      saveCheckout(next);
      return next;
    });
    if (order.paymentStatus === 'APPROVED') setStep('success');
    else if (order.status === 'CANCELLED') { clearCheckout(); setStep('cancelled'); }
    else if (order.paymentStatus === 'REJECTED') { setError('La terminal no confirmó el pago. Cierra este intento antes de iniciar otro.'); setStep('failed'); }
    else if (order.paymentMethod === 'cash') setStep('cash');
    else setStep('waiting');
  };
  const acceptRef = useRef(acceptOrder);
  useEffect(() => { acceptRef.current = acceptOrder; });

  useEffect(() => {
    const order = orders.find((entry) => entry.operationId === draft.operationId || entry.id === draft.order?.id);
    if (order && draft.submitted) acceptRef.current(order);
  }, [orders, draft.operationId, draft.order?.id, draft.submitted]);

  // Read-only recovery never resends a payment. Re-sending is an explicit retry
  // and always retains the original operation and provider idempotency key.
  useEffect(() => {
    if (!draft.submitted || step !== 'waiting' || offline) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const order = await apiJson<Order>(`/api/orders/${encodeURIComponent(draft.order?.id ?? draft.operationId)}`);
        if (active) { setError(''); acceptRef.current(order); }
      } catch (cause) {
        if (active) setError(cause instanceof ApiError && cause.status === 404 ? 'El envío aún no está confirmado. Usa «Revisar envío» para recuperar esta misma operación.' : 'Esperando conexión para confirmar el pago. Conservamos tu pedido.');
      }
      if (active) timer = setTimeout(check, 5_000);
    };
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [draft.submitted, draft.operationId, draft.order?.id, step, offline]);

  const submit = async (method = draft.paymentMethod) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setStep('connecting');
    const next = { ...draft, paymentMethod: method, submitted: true };
    try {
      saveCheckout(next); setDraft(next);
      const payload = { operationId: next.operationId, source: window.location.pathname.startsWith('/kiosk') ? 'KIOSK' : 'POS', customerName: next.customerName.trim(), items: next.cartItems.map((item) => ({ productId: item.product.id, quantity: item.quantity, customization: item.customization, selectedCustomVariants: item.selectedCustomVariants, quantitySelections: item.quantitySelections })), expectedSubtotal: next.cartItems.reduce((sum, item) => sum + item.totalPrice, 0), paymentMethod: method, discountAuthorizationToken: discountToken || undefined, voucherCode: next.voucher?.code };
      let result: { order: Order; mode: string };
      try {
        result = await apiJson('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } catch (cause) {
        if (!(cause instanceof ConnectionError) || method !== 'cash' || discountToken || next.voucher) throw cause;
        const device = await getDeviceCredentials();
        if (!device) throw new Error('Esta terminal perdió su autorización. Solicita ayuda.', { cause });
        await enqueueCashOrder({ operationId: next.operationId, deviceId: device.deviceId, type: 'CREATE_CASH_ORDER', payload });
        if (mounted.current) { setOffline(true); setStep('cash'); }
        window.dispatchEvent(new Event('rofe-outbox-changed'));
        return;
      }
      if (mounted.current) { setSimulation(result.mode === 'simulation'); setDraft((previous) => ({ ...previous, simulation: result.mode === 'simulation' })); acceptRef.current(result.order); }
    } catch (cause) {
      if (mounted.current) { setError(cause instanceof Error ? cause.message : 'No pudimos registrar el pedido. Intenta de nuevo.'); setStep('failed'); }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };

  const cancel = async () => {
    if (inFlight.current) return;
    if (!draft.submitted) { clearCheckout(); setStep('cancelled'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const { order } = await apiJson<{ order: Order }>(`/api/orders/${encodeURIComponent(draft.order?.id ?? draft.operationId)}/cancel-payment`, { method: 'POST' });
      acceptRef.current(order);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) { clearCheckout(); setStep('cancelled'); return; }
      setError(cause instanceof Error ? cause.message : 'No pudimos cancelar. Revisa la terminal.');
    } finally { inFlight.current = false; setBusy(false); }
  };
  const simulate = async () => {
    if (inFlight.current || !draft.order) return;
    inFlight.current = true; setBusy(true);
    try {
      const result = await apiJson<{ order: Order }>(`/api/orders/${draft.order.id}/simulate-payment`, { method: 'POST' });
      acceptRef.current(result.order);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo simular el pago.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return { draft, setDraft, step, setStep, error, setError, simulation, busy, offline, discountToken, setDiscountToken, submit, cancel, simulate };
}
