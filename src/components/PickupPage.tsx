import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ProductModal } from './ProductModal';
import { UiIcon } from './UiIcon';
import { PaymentOutcomeIcon } from './PaymentOutcomeIcon';
import { usePaymentFeedback } from '../hooks/usePaymentFeedback';
import { apiUrl } from '../services/api';
import { newPickupToken, openStripeCheckout, pickupRequest, readPickupDraft, savePickupDraft, PickupApiError, type PickupAttempt, type PickupMenu, type PickupOrder, type PickupReceipt } from '../services/pickup';
import type { CartItem, Product } from '../types';
import { pickupSummary } from '../utils/pickupSummary';
import { createOperationId } from '../utils/id';
import '../styles/pickup.css';

/* ROFÉ pickup extends the existing olive/cream identity into a phone menu.
   Task: choose, personalize, review the pickup location, pay with Stripe, keep a receipt.
   First viewport: the brand and pickup location, an espresso photograph, a direct invitation,
   sticky categories and an immediately usable menu. The cart stays at the thumb edge.
   Receipt states come from the server; provider return navigation never proves payment. */
const money = (amount: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
const categories = [{ id: 'all', name: 'Todo' }, { id: 'coffee', name: 'Café caliente' }, { id: 'cold', name: 'Bebidas frías' }, { id: 'bakery', name: 'Panadería' }];
const orderStates = ['PAID', 'IN_PREPARATION', 'READY', 'COMPLETED'];
const stateCopy: Record<string, { title: string; body: string }> = {
  PENDING_PAYMENT: { title: 'Tu pedido está reservado.', body: 'El pago aún no está confirmado. Puedes continuar con la misma compra o cancelar este intento.' },
  PAID: { title: 'Ya recibimos tu pedido.', body: 'El pago está confirmado. Nuestro equipo comenzará a preparar tu pedido.' },
  IN_PREPARATION: { title: 'Tu pausa está en preparación.', body: 'Estamos preparando tu pedido. Esta página se actualizará cuando esté listo.' },
  READY: { title: 'Tu café te está esperando.', body: 'Tu pedido está listo. Acércate a la barra y presenta tu nombre y folio.' },
  COMPLETED: { title: 'Que disfrutes tu pausa.', body: 'Tu pedido fue entregado. Gracias por elegir ROFÉ.' },
  CANCELLED: { title: 'Este pedido se canceló.', body: 'El pago de este intento no se completó. Puedes volver al menú y crear otro pedido.' },
  REFUNDED: { title: 'Tu devolución está confirmada.', body: 'Se confirmó la devolución completa a tu tarjeta. Tu banco determina cuándo se verá reflejada.' },
};

export default function PickupPage() {
  const [draft, setDraft] = useState(readPickupDraft);
  const [screen, setScreen] = useState<'menu' | 'cart' | 'receipt'>(() => readPickupDraft().activeReceipt ? 'receipt' : 'menu');
  const [menu, setMenu] = useState<PickupMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuError, setMenuError] = useState('');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [order, setOrder] = useState<PickupOrder | null>(null);
  const [orderError, setOrderError] = useState('');
  const [orderMissing, setOrderMissing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const receipt = draft.activeReceipt;
  const receiptId = receipt?.id;
  const receiptToken = receipt?.accessToken;
  const outcome = screen === 'receipt' && order && order.id === receiptId ? order.paymentStatus === 'APPROVED' ? 'success' : order.paymentStatus === 'REJECTED' ? 'failure' : null : null;
  const feedback = usePaymentFeedback(outcome, receiptId ?? '');
  const count = draft.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = draft.cart.reduce((sum, item) => sum + item.totalPrice, 0);

  useEffect(() => { document.title = 'Pide y recoge · ROFÉ'; if (window.location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`); }, []);
  useEffect(() => { setStorageError(!savePickupDraft(draft)); }, [draft]);
  const loadMenu = useCallback(async () => {
    setLoading(true); setMenuError('');
    try { setMenu(await pickupRequest<PickupMenu>('/menu')); }
    catch (cause) { setMenuError(cause instanceof Error ? cause.message : 'No pudimos cargar el menú.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadMenu(); }, [loadMenu]);

  const updateReceipt = useCallback((value: PickupOrder) => {
    setOrder(value); setOrderError(''); setOrderMissing(false);
    if (value.paymentStatus !== 'PENDING') setCheckoutUrl(null);
    if (value.paymentStatus === 'APPROVED' || value.paymentStatus === 'REFUNDED') {
      setDraft((current) => ({ ...current, ...(current.attempt?.operationId === value.id ? { cart: [], attempt: undefined } : {}), receipts: current.receipts.map((item) => item.id === value.id ? { ...item, folio: value.folio } : item) }));
    }
  }, []);
  useEffect(() => {
    if (screen !== 'receipt' || !receiptId || !receiptToken) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      setChecking(true);
      try {
        const value = await pickupRequest<PickupOrder>(`/orders/${receiptId}`, { headers: { 'X-Pickup-Token': receiptToken }, signal: controller.signal });
        if (controller.signal.aborted) return;
        updateReceipt(value);
        if (!['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(value.status)) timer = setTimeout(() => void poll(), 5000);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setOrderError(cause instanceof Error ? cause.message : 'No pudimos consultar tu pedido.');
          if (cause instanceof PickupApiError && cause.status === 404) setOrderMissing(true);
          else timer = setTimeout(() => void poll(), 10_000);
        }
      } finally { if (!controller.signal.aborted) setChecking(false); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [screen, receiptId, receiptToken, updateReceipt]);

  const navigate = (next: typeof screen) => { setScreen(next); setError(''); requestAnimationFrame(() => { document.querySelector('.pickup-app')?.scrollTo({ top: 0, behavior: 'instant' }); headingRef.current?.focus({ preventScroll: true }); }); };
  const remember = (value: PickupReceipt) => setDraft((current) => ({ ...current, activeReceipt: value, receipts: [value, ...current.receipts.filter((item) => item.id !== value.id)].slice(0, 5) }));
  const addItem = (item: CartItem) => {
    if (draft.attempt) { setError('Tienes un pago pendiente. Revisa ese pedido antes de cambiar el carrito.'); navigate('receipt'); return; }
    if (count + item.quantity > 20) { setError('Puedes pedir hasta 20 productos a la vez.'); return; }
    setDraft((current) => {
      const existing = current.cart.find((entry) => entry.id === item.id);
      return { ...current, cart: existing ? current.cart.map((entry) => entry.id === item.id ? { ...entry, quantity: entry.quantity + item.quantity, totalPrice: entry.totalPrice + item.totalPrice } : entry) : [...current.cart, item] };
    });
    setError(''); setSelected(null);
  };
  const quantity = (id: string, amount: number) => {
    if (draft.attempt || (amount > 0 && count >= 20)) return;
    setDraft((current) => ({ ...current, cart: current.cart.flatMap((item) => item.id !== id ? [item] : item.quantity + amount <= 0 ? [] : [{ ...item, quantity: item.quantity + amount, totalPrice: (item.totalPrice / item.quantity) * (item.quantity + amount) }]) }));
  };
  const checkout = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    let currentAttempt = draft.attempt;
    try {
      if (checkoutUrl && receipt) {
        const result = await pickupRequest<{ order: PickupOrder; checkoutUrl: string | null }>(`/orders/${receipt.id}/resume`, { method: 'POST', headers: { 'X-Pickup-Token': receipt.accessToken } });
        updateReceipt(result.order);
        if (result.checkoutUrl) openStripeCheckout(result.checkoutUrl);
        else navigate('receipt');
        return;
      }
      const attempt: PickupAttempt = draft.attempt ?? {
        operationId: createOperationId(), accessToken: newPickupToken(), customerName: draft.customerName.trim(), standId: draft.standId, notes: draft.notes.trim(),
        items: draft.cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, customization: item.customization, selectedCustomVariants: item.selectedCustomVariants })),
      };
      const pendingReceipt = { id: attempt.operationId, accessToken: attempt.accessToken };
      currentAttempt = attempt;
      const next = { ...draft, attempt, activeReceipt: pendingReceipt, receipts: [pendingReceipt, ...draft.receipts.filter((item) => item.id !== pendingReceipt.id)].slice(0, 5) };
      if (!savePickupDraft(next)) throw new Error('Este navegador no permite guardar el comprobante. Habilita el almacenamiento del sitio antes de pagar.');
      setDraft(next);
      const response = await pickupRequest<{ order: PickupOrder; checkoutUrl: string | null }>('/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) });
      setOrder(response.order); remember({ ...pendingReceipt, folio: response.order.folio });
      if (response.checkoutUrl) {
        setCheckoutUrl(response.checkoutUrl);
        if (Math.abs(response.order.total - total) > 0.01 && !draft.attempt) {
          setDraft((current) => ({ ...current, cart: current.cart.map((item, index) => ({ ...item, totalPrice: response.order.items[index]?.totalPrice ?? item.totalPrice })) }));
          setError(`El menú se actualizó. El total confirmado es ${money(response.order.total)} MXN. Revisa el importe antes de continuar.`);
          return;
        }
        openStripeCheckout(response.checkoutUrl);
      } else { updateReceipt(response.order); navigate('receipt'); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos abrir el pago. Reintenta el mismo pedido.');
      if (cause instanceof PickupApiError && currentAttempt) {
        try {
          const recovered = await pickupRequest<PickupOrder>(`/orders/${currentAttempt.operationId}`, { headers: { 'X-Pickup-Token': currentAttempt.accessToken } });
          updateReceipt(recovered);
          if (recovered.paymentStatus !== 'PENDING') navigate('receipt');
        }
        catch (lookup) {
          if (lookup instanceof PickupApiError && lookup.status === 404) {
            const id = currentAttempt.operationId;
            setDraft((current) => ({ ...current, attempt: undefined, activeReceipt: undefined, receipts: current.receipts.filter((item) => item.id !== id) }));
          }
        }
      }
    }
    finally { busyRef.current = false; setBusy(false); }
  };
  const cancel = async () => {
    if (!receipt || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = await pickupRequest<PickupOrder>(`/orders/${receipt.id}/cancel`, { method: 'POST', headers: { 'X-Pickup-Token': receipt.accessToken } });
      updateReceipt(result);
      if (result.status === 'CANCELLED') { setCheckoutUrl(null); setDraft((current) => ({ ...current, attempt: undefined })); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos cancelar el intento.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const resume = async () => {
    if (!receipt || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = await pickupRequest<{ order: PickupOrder; checkoutUrl: string | null }>(`/orders/${receipt.id}/resume`, { method: 'POST', headers: { 'X-Pickup-Token': receipt.accessToken } });
      updateReceipt(result.order);
      if (result.checkoutUrl) openStripeCheckout(result.checkoutUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos recuperar el pago.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const freshOrder = () => { setDraft((current) => ({ ...current, cart: [], attempt: undefined, activeReceipt: undefined, notes: '' })); setOrder(null); setCheckoutUrl(null); history.replaceState(null, '', `/pedir?stand=${draft.standId}`); navigate('menu'); void loadMenu(); };
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const products = (menu?.products ?? []).filter((product) => (category === 'all' || product.category === category) && normalize(`${product.name} ${product.description}`).includes(normalize(query)));
  const copy = order ? stateCopy[order.status] ?? stateCopy.PENDING_PAYMENT : null;
  const progress = order ? orderStates.indexOf(order.status) : -1;
  const imageUrl = (image?: string) => image?.startsWith('/api/') ? apiUrl(image) : image;

  return <div className={`pickup-app pickup-screen-${screen}`}>
    <a className="skip-link" href="#pickup-main">Saltar al menú</a>
    <header className="pickup-header"><a href="/pedir" className="pickup-wordmark" aria-label="ROFÉ, inicio">ROFÉ<span>.</span></a><span className="pickup-header-note">Pide. Paga. Recoge.</span>{draft.receipts.length > 0 && <button className="pickup-text-button" onClick={() => { const latest = draft.receipts[0]!; setOrder(null); remember(latest); navigate('receipt'); }}><UiIcon name="bag" size={18} />Tu pedido</button>}</header>
    <main id="pickup-main" className="pickup-main">
      {storageError && <p className="pickup-notice" role="alert">No podemos guardar datos en este navegador. Habilita el almacenamiento del sitio para conservar tu comprobante.</p>}
      {screen === 'receipt' && receipt ? <section className="pickup-receipt" aria-live="polite" aria-busy={checking && !order}>
        <button className="pickup-text-button" onClick={() => navigate('menu')}><UiIcon name="arrow" className="pickup-back-icon" />Ver menú</button>
        {order ? <>
          {outcome ? <PaymentOutcomeIcon outcome={outcome} /> : <div className={`pickup-receipt-symbol ${order.status === 'READY' ? 'is-ready' : ''}`}><UiIcon name="bag" size={42} /></div>}
          <h1 ref={headingRef} tabIndex={-1}>{copy!.title}</h1><p className="pickup-lead">{copy!.body}</p>
          {feedback.soundBlocked && <button type="button" className="payment-sound-replay" onClick={feedback.replaySound}>Escuchar sonido</button>}
          <div className="pickup-ticket"><div><span>Tu folio</span><strong>{order.folio}</strong></div><div><span>A nombre de</span><strong>{order.customerName}</strong></div></div>
          {progress >= 0 && <ol className="pickup-progress" aria-label="Estado del pedido">{['Recibido', 'En preparación', 'Listo', 'Entregado'].map((label, index) => <li key={label} className={index <= progress ? 'is-done' : ''} aria-current={index === progress ? 'step' : undefined}><span>{index < progress ? <UiIcon name="check" size={14} /> : index + 1}</span>{label}</li>)}</ol>}
          <div className="pickup-location"><UiIcon name="pin" size={24} /><div><h2>{order.pickup.locationName}</h2>{order.pickup.locationAddress && <p>{order.pickup.locationAddress}</p>}<p>{menu?.instructions ?? 'Presenta tu nombre y folio al recoger en barra.'}</p></div></div>
          <div className="pickup-receipt-items">{order.items.map((item, index) => <div key={index}><span>{item.quantity} × {item.productName}<small>{pickupSummary(item.customization, item.selectedCustomVariants, item.customizable)}</small></span><strong>{money(item.totalPrice)}</strong></div>)}<div className="pickup-total"><span>{order.paymentStatus === 'APPROVED' ? 'Total pagado' : order.paymentStatus === 'REFUNDED' ? 'Total devuelto' : 'Total'} · MXN</span><strong>{money(order.total)}</strong></div></div>
          {order.paymentStatus === 'PENDING' && <div className="pickup-receipt-actions"><button className="pickup-primary" disabled={busy || storageError} onClick={() => void resume()}>{busy ? 'Verificando…' : `Continuar pago · ${money(order.total)}`}<UiIcon name="arrow" /></button><button className="pickup-text-button" disabled={busy} onClick={() => void cancel()}>Cancelar este intento</button></div>}
          {['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.status) && <button className="pickup-primary" onClick={freshOrder}>Hacer otro pedido<UiIcon name="arrow" /></button>}
          {order.paymentStatus === 'APPROVED' && order.status !== 'COMPLETED' && <p className="pickup-small">Conserva esta página. El estado se actualiza automáticamente.</p>}
        </> : <div className="pickup-receipt-loading"><UiIcon name="coffee" size={40} /><h1 ref={headingRef} tabIndex={-1}>{orderMissing ? 'Vamos a recuperar tu compra.' : 'Consultando tu pedido…'}</h1><p>{orderMissing ? 'Este intento todavía no tiene un pedido registrado. Puedes volver a revisar tu carrito.' : 'Verificamos el pago y su estado con la cafetería.'}</p>{orderMissing && <button className="pickup-secondary" onClick={() => { setDraft((current) => ({ ...current, attempt: undefined, activeReceipt: undefined, receipts: current.receipts.filter((item) => item.id !== receipt.id) })); setOrderMissing(false); navigate('cart'); }}>Revisar mi carrito</button>}</div>}
        {orderError && !orderMissing && <p className="pickup-error" role="alert">{orderError} Seguiremos intentando recuperar el estado.</p>}{error && <p className="pickup-error" role="alert">{error}</p>}
      </section> : <div className="pickup-layout">
        <section className="pickup-menu-surface">
          <div className="pickup-hero"><div className="pickup-hero-copy"><h1 ref={screen === 'menu' ? headingRef : undefined} tabIndex={-1}>Tu café,<br />a tu ritmo<span>.</span></h1><p>Elige tu favorito, paga desde aquí y recógelo en barra.</p><a href="#pickup-products" className="pickup-hero-link">Explorar menú<UiIcon name="arrow" size={18} /></a></div><img src="/espresso.webp" alt="Espresso ROFÉ recién preparado" className="pickup-hero-image" /></div>
          <div className="pickup-place"><UiIcon name="pin" size={20} /><div><strong>{menu?.locationName ?? 'ROFÉ Espresso Bar'}</strong><span>{menu?.locationAddress || 'Pedido para recoger en barra'}</span></div></div>
          {menu && !menu.acceptingOrders && <p className="pickup-notice">Los pedidos en línea están pausados. Puedes explorar el menú y pedir directamente en barra.</p>}
          <div className="pickup-menu-navigation" id="pickup-products"><h2>¿Qué se te antoja?</h2><label className="pickup-search"><UiIcon name="search" /><span className="sr-only">Buscar en el menú</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca tu próxima pausa" /></label><div className="pickup-categories" aria-label="Categorías">{categories.map((item) => <button key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}</div></div>
          <div className="pickup-product-list" aria-busy={loading}>
            {loading && !menu && <p className="pickup-empty" role="status">Estamos preparando el menú…</p>}
            {menuError && <div className="pickup-empty" role="alert"><p>{menuError}</p><button className="pickup-secondary" onClick={() => void loadMenu()}>Volver a cargar</button></div>}
            {!loading && !menuError && products.length === 0 && <div className="pickup-empty"><UiIcon name="search" size={32} /><p>No encontramos ese antojo.</p><button className="pickup-text-button" onClick={() => { setQuery(''); setCategory('all'); }}>Ver todo el menú</button></div>}
            {products.map((product) => <button key={product.id} className="pickup-product" disabled={product.stock !== undefined && product.stock <= 0} onClick={() => { if (draft.attempt) { navigate('receipt'); return; } setSelected(product); }}>
              <div className="pickup-product-copy"><h3>{product.name}</h3><p>{product.description}</p><strong>{money(product.price)}<span>MXN</span></strong></div><div className="pickup-product-visual">{product.image ? <img src={imageUrl(product.image)} alt="" loading="lazy" /> : <UiIcon name="coffee" size={36} />}<span className="pickup-product-add" aria-hidden="true"><UiIcon name="plus" size={20} /></span>{product.stock !== undefined && product.stock <= 0 && <span className="pickup-sold-out">Agotado</span>}</div>
            </button>)}
          </div>
          {error && screen === 'menu' && <p className="pickup-error" role="alert">{error}</p>}
          <footer className="pickup-menu-footer"><span className="pickup-wordmark">ROFÉ<span>.</span></span><p>Buen café. Una pausa a tu manera.</p><span>Precios en MXN. El total se confirma antes del pago.</span></footer>
        </section>
        <aside className="pickup-cart" aria-label="Tu pedido">
          <button className="pickup-text-button pickup-cart-back" onClick={() => navigate('menu')}><UiIcon name="arrow" className="pickup-back-icon" />Seguir eligiendo</button>
          <div className="pickup-cart-heading"><h2 ref={screen === 'cart' ? headingRef : undefined} tabIndex={-1}>Tu próxima pausa</h2><span>{count} {count === 1 ? 'producto' : 'productos'}</span></div>
          {count === 0 ? <div className="pickup-cart-empty"><UiIcon name="coffee" size={42} /><p>Todo empieza con un buen café.</p><span>Elige algo del menú y lo preparamos para ti.</span></div> : <>
            <div className="pickup-cart-items">{draft.cart.map((item) => <article key={item.id}><div><h3>{item.product.name}</h3><p>{pickupSummary(item.customization, item.selectedCustomVariants, item.product.customizable) || 'Preparación de la casa'}</p><strong>{money(item.totalPrice)}</strong></div><div className="pickup-quantity"><button type="button" disabled={Boolean(draft.attempt)} onClick={() => quantity(item.id, -1)} aria-label={`Quitar uno de ${item.product.name}`}><UiIcon name="minus" size={16} /></button><span>{item.quantity}</span><button type="button" disabled={Boolean(draft.attempt) || count >= 20} onClick={() => quantity(item.id, 1)} aria-label={`Agregar uno de ${item.product.name}`}><UiIcon name="plus" size={16} /></button></div></article>)}</div>
            <form className="pickup-checkout-form" onSubmit={(event) => void checkout(event)}><div className="pickup-field"><label htmlFor="pickup-name">¿A nombre de quién?</label><input id="pickup-name" autoComplete="given-name" placeholder="Tu nombre" minLength={2} maxLength={80} required value={draft.customerName} disabled={Boolean(draft.attempt)} onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))} /></div><div className="pickup-field"><label htmlFor="pickup-notes">Una nota para la barra <span>(opcional)</span></label><textarea id="pickup-notes" placeholder="¿Algo que debamos saber?" rows={2} maxLength={240} value={draft.notes} disabled={Boolean(draft.attempt)} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="pickup-cart-location"><UiIcon name="pin" size={18} /><span>Recoges en <strong>{menu?.locationName ?? 'ROFÉ Espresso Bar'}</strong>{menu?.locationAddress && <small>{menu.locationAddress}</small>}</span></div><div className="pickup-total"><span>Total · MXN</span><strong>{money(order?.paymentStatus === 'PENDING' ? order.total : total)}</strong></div>
              {error && <p className="pickup-error" role="alert">{error}</p>}
              {menu && !menu.acceptingOrders && !draft.attempt && <p className="pickup-notice" role="status">Los pedidos en línea están pausados. Puedes pedir directamente en barra. Tu carrito queda guardado para cuando vuelvan a estar disponibles.</p>}
              <button className="pickup-primary" type="submit" disabled={busy || (!menu?.acceptingOrders && !draft.attempt) || storageError}><UiIcon name="card" />{busy ? 'Abriendo pago seguro…' : draft.attempt ? `Continuar pago · ${money(order?.total ?? total)}` : 'Pagar con tarjeta'}<UiIcon name="arrow" /></button><p className="pickup-payment-note"><UiIcon name="lock" size={14} />Pago seguro con Stripe. Tu tarjeta se captura en su página de pago.</p>{draft.attempt && <button type="button" className="pickup-text-button" onClick={() => navigate('receipt')}>Consultar o cancelar el pedido pendiente</button>}
            </form>
          </>}
        </aside>
      </div>}
    </main>
    {screen === 'menu' && count > 0 && <div className="pickup-mobile-cart"><button className="pickup-primary" onClick={() => navigate('cart')}><span className="pickup-cart-count">{count}</span><span>Ver mi pedido</span><strong>{money(total)}</strong><UiIcon name="arrow" /></button></div>}
    {selected && <ProductModal key={selected.id} product={selected} onClose={() => setSelected(null)} onAddToCart={addItem} />}
  </div>;
}
