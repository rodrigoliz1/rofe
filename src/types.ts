export interface CustomVariantOption {
  name: string;
  priceModifier: number;
}

export interface CustomVariantGroup {
  title: string;
  options: CustomVariantOption[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'coffee' | 'cold' | 'bakery';
  icon: string; // 'espresso' | 'double_espresso' | 'americano' | 'latte' | 'cold_brew' | 'croissant' | 'pain_choc'
  customizable: boolean;
  image?: string;
  stock?: number; // Added for inventory management
  cost?: number; // Added for cost management
  recipe?: Record<string, number>; // Recipe logic
  custom_variants?: CustomVariantGroup[];
}

export interface CustomizationOptions {
  size: 'regular' | 'grande';
  milk: 'none' | 'whole' | 'light' | 'avena' | 'almendra';
  sweetness: 'none' | 'standard' | 'extra';
  temp: 'hot' | 'iced';
  extraShot: boolean;
}

export interface CartItem {
  id: string; // Unique ID for this specific configured item
  product: Product;
  quantity: number;
  customization: CustomizationOptions;
  selectedCustomVariants?: Record<string, string>; // title -> optionName
  totalPrice: number;
}

export type OrderStatus = 'pending_payment' | 'pending_cash_payment' | 'paid' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'rejected';

export interface Order {
  id: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  customerName?: string;
  paymentMethod: 'card' | 'cash';
  paymentId?: string;
  paymentIntentId?: string;
}


