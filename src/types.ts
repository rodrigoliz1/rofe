export interface CustomVariantOption {
  name: string;
  priceModifier: number;
  ingredientId?: string;
  ingredientQuantity?: number;
  recipeDeltas?: Record<string, number>;
  instruction?: string;
  available?: boolean;
}

export interface CustomVariantGroup {
  title: string;
  options: CustomVariantOption[];
  kind?: 'choice' | 'quantity';
  purpose?: 'general' | 'size' | 'milk' | 'ice' | 'temperature' | 'coffee' | 'sugar' | 'splenda';
  enabled?: boolean;
  required?: boolean;
  ingredientId?: string;
  amountPerUnit?: number;
  min?: number;
  max?: number;
  pricePerUnit?: number;
  availableMax?: number;
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
  quantitySelections?: Record<string, number>;
  preparation?: string[];
  recipeSnapshot?: Record<string, number>;
  recipeCostSnapshot?: number;
  ingredientInstructions?: string[];
  totalPrice: number;
}

export type OrderStatus = 'DRAFT' | 'PENDING_PAYMENT' | 'PAID' | 'IN_PREPARATION' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type PaymentStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REFUNDED';

export interface Order {
  id: string;
  folio?: string;
  operationId?: string;
  deviceId?: string;
  channel?: 'POS' | 'QR_PICKUP';
  entrypoint?: 'POS' | 'KIOSK';
  paymentProvider?: 'MERCADO_PAGO' | 'STRIPE';
  pickup?: { standId: string; locationName: string; locationAddress: string };
  items: CartItem[];
  subtotal?: number;
  discount?: number;
  tax?: number;
  total: number;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  createdAt: string;
  customerName?: string;
  paymentMethod: 'card' | 'cash';
  /** Part of the total already paid with change vouchers. */
  voucherAmount?: number;
  paymentId?: string;
  paymentIntentId?: string;
  notes?: string;
  cancellationReason?: string;
}
