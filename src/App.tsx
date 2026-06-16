import { useState, useEffect } from 'react';
import type { Product, CartItem, Order, OrderStatus } from './types';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Catalog } from './components/Catalog';
import { Cart } from './components/Cart';
import { ProductModal } from './components/ProductModal';
import { CheckoutModal } from './components/CheckoutModal';
import { BaristaView } from './components/BaristaView';
import { PasswordPromptModal } from './components/PasswordPromptModal';
import { AdminView } from './components/AdminView';

function App() {
  const [started, setStarted] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'coffee' | 'cold' | 'bakery'>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Dynamic Product Catalog
  const [productCatalog, setProductCatalog] = useState<Product[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [viewMode, setViewMode] = useState<'client' | 'barista' | 'admin'>('client');
  const [orders, setOrders] = useState<Order[]>([]);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  // API URL Helper
  const getApiUrl = (path: string) => {
    const base = import.meta.env.VITE_API_URL || 
                 (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')
                   ? `http://${window.location.hostname}:3000`
                   : window.location.origin);
    return `${base}${path}`;
  };

  const loadProducts = async () => {
    try {
      const res = await fetch(getApiUrl('/api/products'));
      if (res.ok) {
        const data = await res.json();
        data.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setProductCatalog(data);
      }
    } catch (e) {
      console.error('Error fetching products:', e);
    }
  };

  const loadOrders = async () => {
    try {
      const res = await fetch(getApiUrl('/api/orders'));
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (e) {
      console.error('Error fetching orders:', e);
    }
  };

  const loadInventory = async () => {
    // Inventory loading is now handled in AdminView
  };

  // Sync Manager: Periodically attempt to sync offline orders
  useEffect(() => {
    const syncOfflineData = async () => {
      if (!navigator.onLine) return;
      
      const offlineQueueStr = localStorage.getItem('motocarro_offline_sync');
      if (!offlineQueueStr) return;
      
      const offlineQueue = JSON.parse(offlineQueueStr);
      const readyToSync = offlineQueue.filter((item: any) => !item.isPendingPayment);
      
      if (readyToSync.length === 0) return;

      try {
        console.log(`Intentando sincronizar ${readyToSync.length} transacciones offline...`);
        const response = await fetch(getApiUrl('/api/orders/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ syncData: readyToSync })
        });
        
        if (response.ok) {
          console.log('Sincronización exitosa.');
          const syncedIds = readyToSync.map((item: any) => item.order.id);
          const remainingQueue = offlineQueue.filter((item: any) => !syncedIds.includes(item.order.id));
          
          if (remainingQueue.length === 0) {
            localStorage.removeItem('motocarro_offline_sync');
          } else {
            localStorage.setItem('motocarro_offline_sync', JSON.stringify(remainingQueue));
          }
        }
      } catch (error) {
        console.error('Error al sincronizar datos offline', error);
      }
    };

    window.addEventListener('online', syncOfflineData);
    const interval = setInterval(syncOfflineData, 30000);
    syncOfflineData();

    return () => {
      window.removeEventListener('online', syncOfflineData);
      clearInterval(interval);
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    loadProducts();
    loadOrders();
    loadInventory();
    
    const savedOrders = localStorage.getItem('motocarro_orders');
    if (savedOrders) {
      setOrders(JSON.parse(savedOrders));
    }
  }, []);

  // Set up SSE for real-time updates
  useEffect(() => {
    const eventSource = new EventSource(getApiUrl('/api/events'));

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        if (data.type === 'order_paid' || data.type === 'order_updated') {
          setOrders((prev) => {
            const index = prev.findIndex((o) => o.id === data.orderId);
            let newOrders = index > -1 ? prev.map((o) => (o.id === data.orderId ? data.order : o)) : [...prev, data.order];
            localStorage.setItem('motocarro_orders', JSON.stringify(newOrders));
            return newOrders;
          });
          loadInventory();
        } else if (data.type === 'inventory_updated') {
          loadProducts();
        } else if (data.type === 'clear_all') {
          setOrders([]);
          localStorage.removeItem('motocarro_orders');
        } 
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    return () => eventSource.close();
  }, []);

  const handleStart = () => setStarted(true);
  const handleSelectCategory = (category: 'all' | 'coffee' | 'cold' | 'bakery') => setSelectedCategory(category);
  const handleProductClick = (product: Product) => setSelectedProduct(product);

  const handleAddToCart = (item: CartItem) => {
    setCart((prevCart) => {
      const existingItemIndex = prevCart.findIndex((i) => i.id === item.id);
      if (existingItemIndex > -1) {
        const newCart = [...prevCart];
        const currentItem = newCart[existingItemIndex];
        const newQty = currentItem.quantity + item.quantity;
        newCart[existingItemIndex] = { ...currentItem, quantity: newQty, totalPrice: (currentItem.totalPrice / currentItem.quantity) * newQty };
        return newCart;
      }
      return [...prevCart, item];
    });
    setSelectedProduct(null);
  };

  const handleRemoveItem = (itemId: string) => setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));

  const handleUpdateQty = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id === itemId) {
          const unitPrice = item.totalPrice / item.quantity;
          return { ...item, quantity: newQty, totalPrice: unitPrice * newQty };
        }
        return item;
      })
    );
  };

  const handleCheckout = () => setShowCheckout(true);
  const handleCancelOrder = () => setCart([]);
  const handlePaymentSuccess = () => {
    setCart([]);
    setShowCheckout(false);
    setStarted(false);
    loadInventory();
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await fetch(getApiUrl(`/api/orders/${encodeURIComponent(orderId)}/status`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (error) {
      console.error('Error actualizando estado:', error);
    }
  };

  const handleClearOrders = async () => {
    try {
      await fetch(getApiUrl('/api/orders/clear'), { method: 'POST' });
    } catch (error) {
      console.error('Error al borrar pedidos:', error);
    }
  };

  const checkoutTotal = cart.reduce((acc, item) => acc + item.totalPrice, 0);

  return (
    <div className="app-container">
      {viewMode === 'barista' && (
        <BaristaView
          orders={orders}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          onClearOrders={handleClearOrders}
          onClose={() => setViewMode('client')}
        />
      )}

      {viewMode === 'admin' && (
        <AdminView
          products={productCatalog}
          onClose={() => setViewMode('client')}
          onInventoryUpdate={loadProducts}
        />
      )}

      {viewMode === 'client' && (
        <>
          {!started && (
            <WelcomeScreen
              onStart={handleStart}
              onAdminClick={() => setShowPasswordPrompt(true)}
            />
          )}

          {started && (
            <div className="pos-layout">
              <Catalog 
                products={productCatalog.filter(p => selectedCategory === 'all' || p.category === selectedCategory)} 
                onSelectCategory={handleSelectCategory}
                selectedCategory={selectedCategory}
                onProductClick={handleProductClick}
              />
              <Cart
                cart={cart}
                onRemoveItem={handleRemoveItem}
                onUpdateQty={handleUpdateQty}
                onCheckout={handleCheckout}
                onCancelOrder={handleCancelOrder}
              />
            </div>
          )}

          {/* Customization Modal */}
          {selectedProduct && (
            <ProductModal
              product={selectedProduct}
              onClose={() => setSelectedProduct(null)}
              onAddToCart={handleAddToCart}
            />
          )}

          {/* Checkout Modal */}
          {showCheckout && (
            <CheckoutModal
              total={checkoutTotal}
              cartItems={cart}
              orders={orders}
              onPaymentSuccess={handlePaymentSuccess}
              onClose={() => setShowCheckout(false)}
            />
          )}

          {/* Password Prompt Modal */}
          {showPasswordPrompt && (
            <PasswordPromptModal
              onClose={() => setShowPasswordPrompt(false)}
              onSuccess={(mode) => {
                setViewMode(mode);
                setShowPasswordPrompt(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;