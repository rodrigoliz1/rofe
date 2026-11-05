import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CartItem, Order, Product } from '../types';
import { Catalog } from '../components/Catalog';
import { Cart } from '../components/Cart';
import { ProductModal } from '../components/ProductModal';
import { CheckoutModal } from '../components/CheckoutModal';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { UiIcon } from '../components/UiIcon';
import type { KioskSettings } from './config';
import type { KioskCategory } from './session';
import { useBackHandler } from './backStack';
import { useIdleTimer } from './useIdleTimer';
import { useLongPress } from './useLongPress';
import { useStackedLayout } from './useMediaQuery';
import { useReachability } from './useReachability';
import { postNative, vibrate } from './nativeBridge';
import { KioskDialog } from './KioskDialog';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export interface KioskTerminalProps {
  settings: KioskSettings;
  products: Product[];
  catalogLoading: boolean;
  onRetryCatalog: () => void;
  started: boolean;
  onStart: () => void;
  cart: CartItem[];
  onAddToCart: (item: CartItem) => void;
  onUpdateQty: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  category: KioskCategory;
  onSelectCategory: (category: KioskCategory) => void;
  selectedProduct: Product | null;
  onSelectProduct: (product: Product | null) => void;
  showCheckout: boolean;
  onOpenCheckout: () => void;
  onCloseCheckout: () => void;
  orders: Order[];
  /** Ends the customer's session: empty order, no name, back to the welcome screen. */
  onResetSession: () => void;
  onStaffAccess: () => void;
  connection: { online: boolean; realtime: boolean; pending: number; error?: string; onRetry: () => void };
  appError: string;
  onDismissError: () => void;
}

/** Discreet admin entry shared by the welcome screen and the header. */
function useAdminGesture(onStaffAccess: () => void) {
  // In the Android shell the native PIN dialog takes over; in a browser the
  // existing server-authenticated staff login opens instead.
  return useLongPress(() => { if (!postNative({ type: 'admin' })) onStaffAccess(); }, 5_000);
}

const KioskWelcome = memo(function KioskWelcome({ onStart, onStaffAccess }: { onStart: () => void; onStaffAccess: () => void }) {
  const admin = useAdminGesture(onStaffAccess);
  return <section className="kiosk-welcome" aria-labelledby="kiosk-welcome-title">
    <div className="kiosk-welcome-brand">
      <h1 id="kiosk-welcome-title" className="kiosk-logo" {...admin}>ROFÉ<span aria-hidden="true">.</span></h1>
      <p className="kiosk-welcome-kicker">ESPRESSO BAR</p>
    </div>
    <p className="kiosk-welcome-copy">Un buen café.<br />Un momento para ti.</p>
    <button type="button" className="kiosk-primary kiosk-welcome-start" onClick={onStart}><span>ORDENAR AQUÍ</span><UiIcon name="arrow" size={26} /></button>
    <p className="kiosk-welcome-foot">Elige · Personaliza · Paga con tarjeta o efectivo</p>
  </section>;
});

function KioskOffline() {
  return <div className="kiosk-overlay kiosk-offline" role="alertdialog" aria-modal="true" aria-labelledby="kiosk-offline-title" aria-describedby="kiosk-offline-text">
    <div className="kiosk-overlay-card">
      <span className="kiosk-offline-mark" aria-hidden="true" />
      <h2 id="kiosk-offline-title">Sin conexión</h2>
      <p id="kiosk-offline-text">Estamos intentando reconectar. Tu pedido se conserva.</p>
      <div className="kiosk-progress" role="status"><span className="spinner-ring height-small" />Reintentando automáticamente</div>
    </div>
  </div>;
}

export function KioskTerminal(props: KioskTerminalProps) {
  const { settings, cart, started, showCheckout, selectedProduct, onResetSession } = props;
  const stacked = useStackedLayout();
  const reachable = useReachability();
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentLocked, setPaymentLocked] = useState(false);
  const [idlePrompt, setIdlePrompt] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const admin = useAdminGesture(props.onStaffAccess);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const partialOrder = cart.length > 0 || Boolean(selectedProduct) || showCheckout;
  const sheetRef = useRef<HTMLElement>(null);

  const reset = useCallback(() => {
    setCartOpen(false); setIdlePrompt(false); setConfirmCancel(false);
    onResetSession();
  }, [onResetSession]);

  // Inactivity: an untouched welcome/menu simply returns home; a partial order asks first.
  // While a card payment is in flight the session is never reset.
  useIdleTimer(started && !paymentLocked && !idlePrompt && !confirmCancel, settings.idleSeconds * 1000, () => {
    if (partialOrder) setIdlePrompt(true); else reset();
  });

  // The sheet only exists in the stacked layout; an empty order has nothing to show.
  useEffect(() => { if (cart.length === 0) setCartOpen(false); }, [cart.length]);
  useEffect(() => { if (cartOpen && stacked) sheetRef.current?.focus(); }, [cartOpen, stacked]);

  // Root of the back stack: dialogs register above it. Never leaves the app.
  useBackHandler(true, () => {
    if (confirmCancel) setConfirmCancel(false);
    else if (cartOpen) setCartOpen(false);
    else if (started && cart.length === 0) reset();
    return true;
  });

  const addToCart = useCallback((item: CartItem) => { vibrate(18, settings.haptics); props.onAddToCart(item); }, [props, settings.haptics]);
  const checkout = () => { setCartOpen(false); props.onOpenCheckout(); };

  return <div className="kiosk-terminal" data-stacked={stacked} data-cart-open={stacked && cartOpen}>
    {!started && <KioskWelcome onStart={props.onStart} onStaffAccess={props.onStaffAccess} />}
    {started && <>
      <header className="kiosk-header">
        <div className="kiosk-header-brand" {...admin}><span className="kiosk-logo kiosk-logo-small">ROFÉ<span aria-hidden="true">.</span></span><span className="kiosk-header-label">Espresso bar</span></div>
        {props.appError && <p className="kiosk-toast" role="status">{props.appError}<button type="button" onClick={props.onRetryCatalog}>Reintentar</button><button type="button" aria-label="Cerrar mensaje" onClick={props.onDismissError}>×</button></p>}
        <ConnectionStatus {...props.connection} />
      </header>
      <div className="kiosk-main">
        <section className="kiosk-catalog" aria-label="Menú">
          <Catalog products={props.products} loading={props.catalogLoading} onRetry={props.onRetryCatalog} selectedCategory={props.category} onSelectCategory={props.onSelectCategory} onProductClick={props.onSelectProduct} showSearch={false} priorityImages={6} />
        </section>
        {stacked && cartOpen && <button type="button" className="kiosk-sheet-backdrop" aria-label="Cerrar pedido" onClick={() => setCartOpen(false)} />}
        <aside ref={sheetRef} className="kiosk-cart" aria-label="Tu pedido" tabIndex={-1} inert={stacked && !cartOpen}>
          {stacked && <button type="button" className="kiosk-sheet-handle" onClick={() => setCartOpen(false)} aria-label="Ocultar pedido"><span aria-hidden="true" /></button>}
          <Cart cart={cart} onRemoveItem={props.onRemoveItem} onUpdateQty={props.onUpdateQty} onCheckout={checkout} onCancelOrder={() => setConfirmCancel(true)} />
        </aside>
      </div>
      {stacked && <div className="kiosk-cart-bar">
        <button type="button" className="kiosk-cart-summary" onClick={() => setCartOpen(true)} disabled={cart.length === 0} aria-expanded={cartOpen}>
          <span className="kiosk-cart-count" aria-hidden="true">{itemCount}</span>
          <span><strong>{cart.length === 0 ? 'Tu pedido está vacío' : 'Ver pedido'}</strong><small>{itemCount === 1 ? '1 artículo' : `${itemCount} artículos`} · {money.format(total)}</small></span>
        </button>
        <button type="button" className="kiosk-primary kiosk-cart-cta" onClick={checkout} disabled={cart.length === 0}>Continuar<UiIcon name="arrow" size={22} /></button>
      </div>}
    </>}
    {selectedProduct && <ProductModal product={selectedProduct} onClose={() => props.onSelectProduct(null)} onAddToCart={addToCart} />}
    {showCheckout && <CheckoutModal total={total} cartItems={cart} orders={props.orders} kiosk={settings} onLockChange={setPaymentLocked} onPaymentSuccess={reset} onClose={props.onCloseCheckout} />}
    {!reachable && !showCheckout && <KioskOffline />}
    {confirmCancel && <KioskDialog title="¿Cancelar tu pedido?" description="Se quitarán todos los productos." primary={{ label: 'Seguir pidiendo', onClick: () => setConfirmCancel(false) }} secondary={{ label: 'Cancelar pedido', onClick: reset }} />}
    {idlePrompt && <KioskDialog title="¿Sigues ahí?" description="Tu pedido se cancelará por inactividad." primary={{ label: 'Continuar pedido', onClick: () => setIdlePrompt(false) }} secondary={{ label: 'Cancelar', onClick: reset }} countdownSeconds={settings.idlePromptSeconds} onTimeout={reset} />}
  </div>;
}
