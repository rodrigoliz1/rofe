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

// Static products catalog styled in "The Coffee" aesthetic (serving as the default metadata schema)
const PRODUCT_CATALOG: Product[] = [
  {
    id: 'espresso',
    name: 'Espresso',
    description: 'Carga sencilla de café espresso extraído con precisión.',
    price: 35.0,
    category: 'coffee',
    icon: 'espresso',
    customizable: true,
    image: '/espresso.png'
  },
  {
    id: 'double-espresso',
    name: 'Double Espresso',
    description: 'Doble carga de espresso para un sabor intenso y concentrado.',
    price: 45.0,
    category: 'coffee',
    icon: 'double_espresso',
    customizable: true,
    image: '/espresso.png',
  },
  {
    id: 'americano',
    name: 'Americano',
    description: 'Espresso diluido en agua caliente. Limpio y balanceado.',
    price: 40.0,
    category: 'coffee',
    icon: 'americano',
    customizable: true,
    image: '/americano.webp',
  },
  {
    id: 'latte',
    name: 'Latte',
    description: 'Espresso con leche cremada al vapor y una fina capa de espuma.',
    price: 55.0,
    category: 'coffee',
    icon: 'latte',
    customizable: true,
    image: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=600',
  },
  {
    id: 'flat-white',
    name: 'Flat White',
    description: 'Espresso doble con leche ligeramente cremada. Proporción intensa.',
    price: 55.0,
    category: 'coffee',
    icon: 'latte',
    customizable: true,
    image: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&q=80&w=600',
  },
  {
    id: 'matcha-latte',
    name: 'Matcha Latte',
    description: 'Té verde matcha japonés de grado ceremonial con leche cremada.',
    price: 60.0,
    category: 'coffee',
    icon: 'latte',
    customizable: true,
    image: '/matcha-latte.jpg',
  },
  {
    id: 'cold-brew',
    name: 'Cold Brew',
    description: 'Café extraído en frío por 18 horas. Refrescante y de baja acidez.',
    price: 50.0,
    category: 'cold',
    icon: 'cold_brew',
    customizable: true,
    image: '/cold-brew.webp',
  },
  {
    id: 'iced-latte',
    name: 'Iced Latte',
    description: 'Espresso con leche fría servido sobre hielo.',
    price: 55.0,
    category: 'cold',
    icon: 'cold_brew',
    customizable: true,
    image: '/iced-latte.webp',
  },
  {
    id: 'iced-matcha-latte',
    name: 'Iced Matcha Latte',
    description: 'Té verde matcha ceremonial batido con leche fría y hielo.',
    price: 65.0,
    category: 'cold',
    icon: 'cold_brew',
    customizable: true,
    image: '/matcha-frio.jpg',
  },
  {
    id: 'croissant-mantequilla',
    name: 'Croissant Mantequilla',
    description: 'Hojaldre tradicional de pura mantequilla, crujiente por fuera.',
    price: 45.0,
    category: 'bakery',
    icon: 'croissant',
    customizable: true,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=600',
  },
  {
    id: 'pain-au-chocolat',
    name: 'Pain au Chocolat',
    description: 'Hojaldre de mantequilla relleno de barras de chocolate semi-amargo.',
    price: 50.0,
    category: 'bakery',
    icon: 'pain_choc',
    customizable: true,
    image: '/pan-chocolate.jpg',
  },
  {
    id: 'galleta-chocolate',
    name: 'Galleta de Chispas de Chocolate',
    description: 'Galleta horneada de chispas de chocolate.',
    price: 25.0,
    category: 'bakery',
    icon: 'pain_choc',
    customizable: true,
    image: '/galleta-chispas.jpeg',
  },
];

function App() {
  const [started, setStarted] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'coffee' | 'cold' | 'bakery'>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [viewMode, setViewMode] = useState<'client' | 'barista' | 'admin'>('client');
  const [orders, setOrders] = useState<Order[]>([]);
  const [catalog, setCatalog] = useState<Product[]>(PRODUCT_CATALOG);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  // API URL Helper
  const getApiUrl = (path: string) => {
    const base = import.meta.env.VITE_API_URL || 
                 (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')
                   ? `http://${window.location.hostname}:3000`
                   : window.location.origin);
    return `${base}${path}`;
  };

  // Load product stocks and costs from server
  const loadInventory = async () => {
    try {
      const response = await fetch(getApiUrl('/api/admin/inventory'));
      if (response.ok) {
        const dbItems = await response.json();
        setCatalog((prev) =>
          prev.map((prod) => {
            const dbItem = dbItems.find((i: any) => i.product_id === prod.id);
            return {
              ...prod,
              stock: dbItem ? dbItem.stock : 0,
              cost: dbItem ? dbItem.cost : 0,
            };
          })
        );
      }
    } catch (e) {
      console.error('Error loading inventory stocks:', e);
    }
  };

  // Load orders from backend on mount and sync via SSE
  useEffect(() => {
    // 1. Initial Fetch of Orders
    const fetchOrders = async () => {
      try {
        const response = await fetch(getApiUrl('/api/orders'));
        if (response.ok) {
          const data = await response.json();
          setOrders(data);
          localStorage.setItem('motocarro_orders', JSON.stringify(data));
        }
      } catch (error) {
        console.error('Error fetching orders from backend:', error);
        // Fallback to localStorage
        const stored = localStorage.getItem('motocarro_orders');
        if (stored) {
          setOrders(JSON.parse(stored));
        }
      }
    };

    fetchOrders();
    loadInventory();

    // 2. Connect SSE
    const API_URL = import.meta.env.VITE_API_URL;
    const eventSource = new EventSource(`${API_URL}/api/events`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          console.log('SSE conectado con éxito.');
          return;
        }

        if (data.type === 'order_paid') {
          console.log('Pedido pagado recibido via SSE:', data.order);
          setOrders((prev) => {
            const index = prev.findIndex((o) => o.id === data.orderId);
            let newOrders;
            if (index > -1) {
              newOrders = prev.map((o) => (o.id === data.orderId ? data.order : o));
            } else {
              newOrders = [...prev, data.order];
            }
            localStorage.setItem('motocarro_orders', JSON.stringify(newOrders));
            return newOrders;
          });
          loadInventory(); // Refresh stock level
        } else if (data.type === 'order_updated') {
          console.log('Pedido actualizado recibido via SSE:', data.order);
          setOrders((prev) => {
            const index = prev.findIndex((o) => o.id === data.orderId);
            let newOrders;
            if (index > -1) {
              newOrders = prev.map((o) => (o.id === data.orderId ? data.order : o));
            } else {
              newOrders = [...prev, data.order];
            }
            localStorage.setItem('motocarro_orders', JSON.stringify(newOrders));
            return newOrders;
          });
          loadInventory(); // Refresh stock level
        } else if (data.type === 'inventory_updated') {
          console.log('Inventario actualizado recibido via SSE.');
          loadInventory();
        } else if (data.type === 'clear_all') {
          console.log('Se limpiaron todos los pedidos via SSE.');
          setOrders([]);
          localStorage.removeItem('motocarro_orders');
        } 
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleStart = () => {
    setStarted(true);
  };

  const handleSelectCategory = (category: 'all' | 'coffee' | 'cold' | 'bakery') => {
    setSelectedCategory(category);
  };

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleAddToCart = (item: CartItem) => {
    setCart((prevCart) => {
      const existingItemIndex = prevCart.findIndex((i) => i.id === item.id);

      if (existingItemIndex > -1) {
        const newCart = [...prevCart];
        const currentItem = newCart[existingItemIndex];
        const newQty = currentItem.quantity + item.quantity;

        newCart[existingItemIndex] = {
          ...currentItem,
          quantity: newQty,
          totalPrice: (currentItem.totalPrice / currentItem.quantity) * newQty,
        };
        return newCart;
      }

      return [...prevCart, item];
    });
    setSelectedProduct(null);
  };

  const handleRemoveItem = (itemId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
  };

  const handleUpdateQty = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id === itemId) {
          const unitPrice = item.totalPrice / item.quantity;
          return {
            ...item,
            quantity: newQty,
            totalPrice: unitPrice * newQty,
          };
        }
        return item;
      })
    );
  };

  const handleCheckout = () => {
    setShowCheckout(true);
  };

  const handleCancelOrder = () => {
    setCart([]);
  };

  const handlePaymentSuccess = (orderId: string, customerName: string) => {
    console.log(`Pedido ${orderId} para ${customerName} registrado/pagado exitosamente.`);
    setCart([]);
    setShowCheckout(false);
    setStarted(false);
    loadInventory(); // Refresh client-side stock levels
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const response = await fetch(getApiUrl(`/api/orders/${encodeURIComponent(orderId)}/status`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        console.error('Error al actualizar estado en el servidor:', response.statusText);
      }
    } catch (error) {
      console.error('Error actualizando estado del pedido:', error);
      // Fallback local
      const updatedOrders = orders.map((order) => {
        if (order.id === orderId) {
          return { ...order, status: newStatus };
        }
        return order;
      });
      setOrders(updatedOrders);
      localStorage.setItem('motocarro_orders', JSON.stringify(updatedOrders));
    }
  };

  const handleClearOrders = async () => {
    try {
      const response = await fetch(getApiUrl('/api/orders/clear'), {
        method: 'POST',
      });
      if (!response.ok) {
        console.error('Error al borrar pedidos en el servidor');
      }
    } catch (error) {
      console.error('Error al borrar pedidos:', error);
      setOrders([]);
      localStorage.removeItem('motocarro_orders');
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
          products={catalog}
          onClose={() => setViewMode('client')}
          onInventoryUpdate={loadInventory}
        />
      )}

      {viewMode === 'client' && (
        <>
          {/* Welcome Screen */}
          {!started && (
            <WelcomeScreen
              onStart={handleStart}
              onAdminClick={() => setShowPasswordPrompt(true)}
            />
          )}

          {/* Main POS Interface */}
          {started && (
            <div className="pos-layout">
              <Catalog
                products={catalog}
                selectedCategory={selectedCategory}
                onSelectCategory={handleSelectCategory}
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
