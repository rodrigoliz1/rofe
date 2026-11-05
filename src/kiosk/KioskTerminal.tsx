import { memo, useCallback, useEffect, useState } from 'react';
import type { CartItem, Order, Product } from '../types';
import { Catalog } from '../components/Catalog';
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
import { KioskCartDrawer } from './KioskCartDrawer';
import { useCatalogPreload } from './useCatalogPreload';

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
  const [added, setAdded] = useState<{ name: string; key: number } | null>(null);
  // Photos start downloading while the welcome screen is shown, not on «ORDENAR AQUÍ».
  useCatalogPreload(props.products, stacked);

  const reset = useCallback(() => {
    setCartOpen(false); setIdlePrompt(false); setConfirmCancel(false);
    onResetSession();
  }, [onResetSession]);

  // Inactivity: an untouched welcome/menu simply returns home; a partial order asks first.
  // While a card payment is in flight the session is never reset.
  useIdleTimer(started && !paymentLocked && !idlePrompt && !confirmCancel, settings.idleSeconds * 1000, () => {
    if (partialOrder) setIdlePrompt(true); else reset();
  });

  // "Agregado" feedback; the order panel never opens by itself.
  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(null), 1_800);
    return () => window.clearTimeout(timer);
  }, [added]);

  // Root of the back stack: dialogs register above it. Never leaves the app.
  useBackHandler(true, () => {
    if (confirmCancel) setConfirmCancel(false);
    else if (cartOpen) setCartOpen(false);
    else if (started && cart.length === 0) reset();
    return true;
  });

  const { onAddToCart } = props;
  const addToCart = useCallback((item: CartItem) => {
    vibrate(18, settings.haptics);
    onAddToCart(item);
    setAdded({ name: item.product.name, key: Date.now() });
  }, [onAddToCart, settings.haptics]);
  const checkout = () => { setCartOpen(false); props.onOpenCheckout(); };

  return <div className="kiosk-terminal" data-stacked={stacked} data-cart-open={cartOpen}>
    {!started && <KioskWelcome onStart={props.onStart} onStaffAccess={props.onStaffAccess} />}
    {started && <>
      <header className="kiosk-header" inert={cartOpen}>
        <div className="kiosk-header-brand" {...admin}><span className="kiosk-logo kiosk-logo-small">ROFÉ<span aria-hidden="true">.</span></span><span className="kiosk-header-label">Espresso bar</span></div>
        {props.appError && <p className="kiosk-toast" role="status">{props.appError}<button type="button" onClick={props.onRetryCatalog}>Reintentar</button><button type="button" aria-label="Cerrar mensaje" onClick={props.onDismissError}>×</button></p>}
        <ConnectionStatus {...props.connection} />
        <button type="button" className="kiosk-order-button" onClick={() => setCartOpen(true)} aria-haspopup="dialog" aria-expanded={cartOpen} aria-label={itemCount === 0 ? 'Tu pedido, vacío' : `Tu pedido, ${itemCount} ${itemCount === 1 ? 'artículo' : 'artículos'}, ${money.format(total)}`}>
          <UiIcon name="bag" size={22} />
          <span className="kiosk-order-label">TU PEDIDO</span>
          {itemCount > 0 && <span key={itemCount} className="kiosk-order-count" aria-hidden="true">{itemCount}</span>}
        </button>
      </header>
      <section className="kiosk-catalog" aria-label="Menú" inert={cartOpen}>
        <Catalog products={props.products} loading={props.catalogLoading} onRetry={props.onRetryCatalog} selectedCategory={props.category} onSelectCategory={props.onSelectCategory} onProductClick={props.onSelectProduct} showSearch={false} priorityImages={8} />
      </section>
      {added && <p key={added.key} className="kiosk-added" role="status"><UiIcon name="check" size={18} />Agregado · {added.name}</p>}
      {cartOpen && <KioskCartDrawer cart={cart} total={total} stacked={stacked} onClose={() => setCartOpen(false)} onRemoveItem={props.onRemoveItem} onUpdateQty={props.onUpdateQty} onCheckout={checkout} onCancelOrder={() => setConfirmCancel(true)} />}
    </>}
    {selectedProduct && <ProductModal product={selectedProduct} showPhoto onClose={() => props.onSelectProduct(null)} onAddToCart={addToCart} />}
    {showCheckout && <CheckoutModal total={total} cartItems={cart} orders={props.orders} kiosk={settings} onLockChange={setPaymentLocked} onPaymentSuccess={reset} onClose={props.onCloseCheckout} />}
    {!reachable && !showCheckout && <KioskOffline />}
    {confirmCancel && <KioskDialog title="¿Cancelar tu pedido?" description="Se quitarán todos los productos." primary={{ label: 'Seguir pidiendo', onClick: () => setConfirmCancel(false) }} secondary={{ label: 'Cancelar pedido', onClick: reset }} />}
    {idlePrompt && <KioskDialog title="¿Sigues ahí?" description="Tu pedido se cancelará por inactividad." primary={{ label: 'Continuar pedido', onClick: () => setIdlePrompt(false) }} secondary={{ label: 'Cancelar', onClick: reset }} countdownSeconds={settings.idlePromptSeconds} onTimeout={reset} />}
  </div>;
}
