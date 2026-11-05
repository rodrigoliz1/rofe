import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { CartItem, Order, OrderStatus, Product } from './types';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Catalog } from './components/Catalog';
import { Cart } from './components/Cart';
import { ProductModal } from './components/ProductModal';
import { CheckoutModal } from './components/CheckoutModal';
import { PasswordPromptModal } from './components/PasswordPromptModal';
import { DeviceSetup } from './components/DeviceSetup';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ApiError, ConnectionError, apiFetch, loginDevice, logout, publicError, tryRestoreSession } from './services/api';
import { cachedCatalog, saveCatalog, getDeviceCredentials } from './services/offline';
import { useOutbox } from './hooks/useOutbox';
import { readCheckout } from './services/checkout';
import { UiIcon } from './components/UiIcon';
import { subscribeToEvents } from './services/events';

const BaristaView = lazy(() => import('./components/BaristaView').then((module) => ({ default: module.BaristaView })));
const AdminView = lazy(() => import('./components/AdminView').then((module) => ({ default: module.AdminView })));

type ViewMode = 'client' | 'barista' | 'admin';
type DeviceState = 'loading' | 'setup' | 'ready' | 'restore-error';

interface RofeEvent { type: string; orderId?: string; order?: Order }

function App({ kiosk = false }: { kiosk?: boolean }) {
  const [deviceState, setDeviceState] = useState<DeviceState>('loading');
  const [started, setStarted] = useState(() => Boolean(readCheckout()));
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'coffee' | 'cold' | 'bakery'>('all');
  const [cart, setCart] = useState<CartItem[]>(() => readCheckout()?.cartItems ?? []);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productCatalog, setProductCatalog] = useState<Product[]>([]);
  const [showCheckout, setShowCheckout] = useState(() => Boolean(readCheckout()));
  const [viewMode, setViewMode] = useState<ViewMode>('client');
  const [orders, setOrders] = useState<Order[]>([]);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [realtime, setRealtime] = useState(false);
  const outbox = useOutbox(deviceState === 'ready' && viewMode === 'client');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [appError, setAppError] = useState('');

  const loadProducts = useCallback(async () => {
    try {
      const response = await apiFetch('/api/products');
      if (!response.ok) throw new Error(await publicError(response));
      const data = await response.json() as Product[];
      setProductCatalog([...data].sort((left, right) => left.name.localeCompare(right.name, 'es')));
      setAppError('');
      await saveCatalog(data);
    } catch (cause) {
      const cached = await cachedCatalog().catch(() => []);
      if (cached.length) setProductCatalog(cached);
      setAppError(cached.length ? 'Menú guardado en el dispositivo. Los precios se verificarán al reconectar.' : cause instanceof Error ? cause.message : 'No pudimos cargar el menú.');
    } finally { setCatalogLoading(false); }
  }, []);

  const loadOrders = useCallback(async () => {
    const response = await apiFetch('/api/orders');
    if (!response.ok) throw new Error(await publicError(response));
    setOrders(await response.json() as Order[]);
  }, []);

  const restoreDeviceSession = useCallback(async () => {
    const restored = kiosk ? null : await tryRestoreSession();
    if (restored) {
      setViewMode(restored.role === 'BARISTA' ? 'barista' : restored.role === 'POS_DEVICE' ? 'client' : 'admin');
      setDeviceState('ready');
      return true;
    }
    let credentials: Awaited<ReturnType<typeof getDeviceCredentials>>;
    try { credentials = await getDeviceCredentials(); }
    catch { setDeviceState('restore-error'); return false; }
    if (credentials) {
      try {
        await loginDevice(credentials.deviceId, credentials.deviceToken);
        setDeviceState('ready'); return true;
      } catch (cause) {
        if (cause instanceof ConnectionError) {
          setAppError('Sin conexión con el servidor. Puedes registrar pedidos en efectivo para sincronizarlos después.');
          setDeviceState('ready'); return true;
        }
        if (!(cause instanceof ApiError) || (cause.status !== 401 && cause.status !== 403)) {
          setDeviceState('restore-error'); return false;
        }
      }
    }
    setDeviceState('setup'); return false;
  }, [kiosk]);

  useEffect(() => { void restoreDeviceSession(); }, [restoreDeviceSession]);
  useEffect(() => { void loadProducts(); }, [loadProducts]);
  useEffect(() => {
    const onOnline = () => { setOnline(true); void loadProducts(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [loadProducts]);

  useEffect(() => {
    if (deviceState !== 'ready') return;
    return subscribeToEvents((rawEvent) => {
      const event = rawEvent as RofeEvent;
      if ((event.type === 'order_paid' || event.type === 'order_updated') && event.order) {
        setOrders((current) => current.some((order) => order.id === event.orderId)
          ? current.map((order) => order.id === event.orderId ? event.order! : order)
          : [...current, event.order!]);
      } else if (event.type === 'inventory_updated') {
        void loadProducts();
      }
    }, (connected) => {
      setRealtime(connected);
      if (connected && viewMode !== 'client') void loadOrders().catch(() => setAppError('No pudimos recuperar los pedidos. Reintenta la conexión.'));
    });
  }, [deviceState, loadProducts, loadOrders, viewMode]);

  useEffect(() => {
    if (viewMode !== 'client') void loadOrders().catch((cause: unknown) => setAppError(cause instanceof Error ? cause.message : 'No pudimos cargar los pedidos.'));
  }, [loadOrders, viewMode]);

  const handleAddToCart = (item: CartItem) => {
    setCart((current) => {
      const index = current.findIndex((candidate) => candidate.id === item.id);
      if (index < 0) return [...current, item];
      const next = [...current];
      const existing = next[index];
      const quantity = Math.min(50, existing.quantity + item.quantity);
      next[index] = { ...existing, quantity, totalPrice: (existing.totalPrice / existing.quantity) * quantity };
      return next;
    });
    setSelectedProduct(null);
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.id !== itemId));
      return;
    }
    quantity = Math.min(50, quantity);
    setCart((current) => current.map((item) => item.id === itemId
      ? { ...item, quantity, totalPrice: (item.totalPrice / item.quantity) * quantity }
      : item));
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const response = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error(await publicError(response));
  };

  const closeStaffView = async () => {
    await logout().catch(() => undefined);
    setOrders([]); setViewMode('client'); setStarted(false); setDeviceState('loading');
    const device = await getDeviceCredentials().catch(() => undefined);
    if (!device) { setDeviceState('setup'); return; }
    try { await loginDevice(device.deviceId, device.deviceToken); setDeviceState('ready'); }
    catch (cause) { setDeviceState(cause instanceof ConnectionError ? 'ready' : cause instanceof ApiError && (cause.status === 401 || cause.status === 403) ? 'setup' : 'restore-error'); }
  };

  if (deviceState === 'loading') return <main className="app-loading"><span>Preparando ROFE…</span></main>;
  if (deviceState === 'restore-error') return <main className="device-setup" id="main-content"><section className="device-setup-panel" aria-labelledby="restore-title"><div className="setup-brand">ROFÉ.</div><h1 id="restore-title">No pudimos conectar la terminal</h1><p>No es necesario volver a registrarla. Comprueba que el servidor de ROFÉ esté encendido y vuelve a intentarlo. Si el problema continúa, revisa que el navegador permita guardar datos del sitio.</p><button type="button" onClick={() => { setDeviceState('loading'); void restoreDeviceSession(); }}>Reintentar conexión</button><button className="setup-staff-access" type="button" onClick={() => setShowPasswordPrompt(true)}>Entrar con una cuenta de equipo</button>{showPasswordPrompt && <PasswordPromptModal onClose={() => setShowPasswordPrompt(false)} onSuccess={(mode) => { setViewMode(mode); setDeviceState('ready'); setShowPasswordPrompt(false); }} />}</section></main>;
  if (deviceState === 'setup') return <>
    <DeviceSetup onReady={() => setDeviceState('ready')} onStaffAccess={() => setShowPasswordPrompt(true)} />
    {showPasswordPrompt && <PasswordPromptModal onClose={() => setShowPasswordPrompt(false)} onSuccess={(mode) => { setViewMode(mode); setDeviceState('ready'); setShowPasswordPrompt(false); }} />}
  </>;

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <ConnectionStatus online={online} realtime={realtime} pending={outbox.pending} error={outbox.error} onRetry={() => void outbox.retry()} />
      {appError && <div className="app-alert" role="alert">{appError}<button onClick={() => void loadProducts()}>Reintentar</button><button onClick={() => setAppError('')} aria-label="Cerrar mensaje">×</button></div>}

      <Suspense fallback={<main className="app-loading"><span>Abriendo módulo…</span></main>}>
        {viewMode === 'barista' && <BaristaView orders={orders} onUpdateOrderStatus={updateOrderStatus} onClose={() => void closeStaffView()} />}
        {viewMode === 'admin' && <AdminView products={productCatalog} onClose={() => void closeStaffView()} onInventoryUpdate={loadProducts} onOpenBarista={() => setViewMode('barista')} />}
      </Suspense>

      {viewMode === 'client' && <main id="main-content">
        {!started && <WelcomeScreen onStart={() => setStarted(true)} onAdminClick={() => setShowPasswordPrompt(true)} />}
        {started && <>
          <header className="pos-toolbar"><button className="pos-brand" onClick={() => setStarted(false)} aria-label="Volver al inicio">ROFÉ<span>.</span></button><span className="pos-toolbar-label">Espresso bar · Hazlo a tu gusto</span><button className="toolbar-action" title="Panel Barista" onClick={() => setShowPasswordPrompt(true)}><UiIcon name="users" />Equipo</button></header>
          <div className="pos-layout">
          <Catalog products={productCatalog} onSelectCategory={setSelectedCategory} selectedCategory={selectedCategory} onProductClick={setSelectedProduct} loading={catalogLoading} onRetry={() => void loadProducts()} />
          <Cart cart={cart} onRemoveItem={(id) => setCart((current) => current.filter((item) => item.id !== id))} onUpdateQty={updateQuantity} onCheckout={() => setShowCheckout(true)} onCancelOrder={() => setCart([])} />
        </div></>}
        {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={handleAddToCart} />}
        {showCheckout && <CheckoutModal total={cart.reduce((sum, item) => sum + item.totalPrice, 0)} cartItems={cart} orders={orders} onPaymentSuccess={() => { setCart([]); setShowCheckout(false); setStarted(false); }} onClose={() => setShowCheckout(false)} />}
        {showPasswordPrompt && <PasswordPromptModal onClose={() => setShowPasswordPrompt(false)} onSuccess={(mode) => { setViewMode(mode); setShowPasswordPrompt(false); }} />}
      </main>}
    </div>
  );
}

export default App;
