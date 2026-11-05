import * as fs from 'fs/promises';
import { AsyncLocalStorage } from 'async_hooks';
import * as path from 'path';
import { getEnv } from './config/env';
import { randomUUID } from 'crypto';
import { applyPurchaseValue, applyWasteValue } from './domain/inventory';

export interface DbRawInventory {
  id: string; // e.g., 'coffee_beans', 'milk_whole'
  name: string;
  unit: string; // e.g., 'g', 'ml', 'un'
  stock: number;
  cost: number; // cost per unit or total cost. Let's say cost is total cost for current stock to calculate unit cost: cost / stock.
  minStock?: number;
  reservedStock?: number;
}

export interface CustomVariantOption {
  name: string;
  priceModifier: number;
}

export interface CustomVariantGroup {
  title: string;
  options: CustomVariantOption[];
}

export interface DbProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'coffee' | 'cold' | 'bakery';
  icon: string;
  customizable: boolean;
  image: string;
  recipe?: Record<string, number>;
  custom_variants?: CustomVariantGroup[];
}

// Define DB structures
export interface DbInventoryItem {
  product_id: string;
  stock: number;
  cost: number;
}

export interface DbInventoryConsumption {
  ingredientId: string;
  quantity: number;
}

export interface DbCashRegister {
  denomination: string;
  count: number;
}

export interface DbCashTransaction {
  id?: number;
  type: 'payment' | 'change' | 'manual_income' | 'manual_expense' | 'adjustment' | 'manual_investment' | 'card_payment' | 'refund' | 'voucher_payout';
  amount: number;
  description: string;
  denominations: Record<string, number>;
  created_at?: string;
  status?: 'active' | 'deleted' | 'modified';
  audit_reason?: string;
  original_amount?: number;
  operationId?: string;
  createdBy?: string;
  cashSessionId?: string;
}

export interface DbBakeryBatch {
  id?: number;
  product_id: string;
  quantity: number;
  added_at: string;
  expires_at: string;
}

export interface DbDailyClosure {
  id?: string;
  closed_at: string;
  total_sales: number;
  total_income: number;
  total_costs: number;
  net_profit: number;
  cash_start: number;
  cash_end: number;
  products_sold: Record<string, number>;
  notes?: string;
  period_start?: string;
  period_end?: string;
  cash_sales?: number;
  card_sales?: number;
  refunds?: number;
  discounts?: number;
  cost_of_goods?: number;
  expenses?: number;
  gross_margin?: number;
  operating_result?: number;
  expected_cash?: number;
  counted_cash?: number;
  difference?: number;
  tickets?: number;
  closed_by?: string;
}

export interface DbSupplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
}

export interface DbPurchaseItem {
  ingredientId: string;
  quantity: number;
  unit: string;
  unitCost: number;
  subtotal: number;
}

export interface DbPurchase {
  cashDenominations?: Record<string, number>;
  id: string;
  supplierId?: string;
  invoiceReference?: string;
  paymentMethod: string;
  total: number;
  notes?: string;
  purchasedAt: string;
  createdBy: string;
  operationId: string;
  items: DbPurchaseItem[];
}

export interface DbWasteRecord {
  id: string;
  ingredientId: string;
  quantity: number;
  costSnapshot: number;
  reason: string;
  userId: string;
  operationId: string;
  createdAt: string;
}

export interface DbInventoryMovement {
  id: string;
  ingredientId: string;
  quantity: number;
  movementType: 'PURCHASE' | 'SALE' | 'WASTE' | 'ADJUSTMENT' | 'PRODUCTION' | 'RETURN' | 'TRANSFER';
  reason?: string;
  userId?: string;
  deviceId?: string;
  orderId?: string;
  purchaseId?: string;
  operationId?: string;
  unitCostSnapshot: number;
  createdAt: string;
}

export interface DbCashSession {
  id: string;
  openingAmount: number;
  openingDenominations: Record<string, number>;
  openedBy: string;
  openedAt: string;
  expectedCash?: number;
  countedCash?: number;
  difference?: number;
  closingDenominations?: Record<string, number>;
  closedBy?: string;
  closedAt?: string;
}

export interface DbProductionBatch {
  id: string;
  productId: string;
  quantityProduced: number;
  totalCost: number;
  wasteQuantity: number;
  expiresAt?: string;
  responsibleUserId: string;
  operationId: string;
  producedAt: string;
  consumption: DbInventoryConsumption[];
}

export interface DbOrderItem {
  id?: string;
  productId?: string;
  productName?: string;
  product?: DbProduct;
  quantity: number;
  unitPrice?: number;
  subtotal?: number;
  totalPrice?: number;
  customization?: Record<string, unknown>;
  selectedCustomVariants?: Record<string, string>;
  modifiers?: Array<{ name: string; amount: number }>;
  notes?: string;
}

import { SupabaseDbAdapter } from './supabaseAdapter';

// Order structures match our existing types
export interface DbPickupSettings {
  enabled: boolean;
  locationName: string;
  locationAddress: string;
  instructions: string;
}

export interface DbOrder {
  id: string;
  folio?: string;
  operationId?: string;
  deviceId?: string;
  channel?: 'POS' | 'QR_PICKUP';
  paymentProvider?: 'MERCADO_PAGO' | 'STRIPE';
  pickup?: {
    accessTokenHash: string;
    requestHash: string;
    standId: string;
    locationName: string;
    locationAddress: string;
    expiresAt: string;
  };
  baristaId?: string;
  customerName: string;
  items: DbOrderItem[];
  subtotal?: number;
  discount?: number;
  discountType?: string;
  discountReason?: string;
  discountAuthorizedBy?: string;
  /** Part of `total` paid with change vouchers (a liability settlement, not a discount). */
  voucherAmount?: number;
  tax?: number;
  total: number;
  status: string;
  paymentStatus?: string;
  paymentMethod: 'card' | 'cash';
  paymentId?: string;
  paymentIntentId?: string;
  notes?: string;
  cancellationReason?: string;
  inventoryAppliedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DbChangeVoucher {
  id: string;
  code: string;
  orderId?: string;
  amount: number;
  balance: number;
  status: 'ACTIVE' | 'REDEEMED' | 'CANCELLED';
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  cancelledReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
}

export interface DbChangeVoucherRedemption {
  id: string;
  voucherId: string;
  kind: 'CASH' | 'ORDER';
  amount: number;
  orderId?: string;
  operationId: string;
  status: 'APPLIED' | 'RELEASED';
  denominations: Record<string, number>;
  userId?: string;
  createdAt: string;
}

/** What the customer still has to pay after vouchers. */
export function amountDue(order: Pick<DbOrder, 'total' | 'voucherAmount'>): number {
  return Math.round((order.total - (order.voucherAmount ?? 0)) * 100) / 100;
}

export interface CashPaymentInput {
  orderId: string;
  paymentId: string;
  consumption: DbInventoryConsumption[];
  receivedAmount: number;
  changeAmount: number;
  receivedDenominations: Record<string, number>;
  changeDenominations: Record<string, number>;
  /** Change the drawer could not give, issued as a voucher in the same transaction. */
  voucher?: { code: string; amount: number; userId: string };
}

// Adaptor interface
export interface DbAdapter {
  initialize(): Promise<void>;
  getOrders(): Promise<DbOrder[]>;
  getOrdersUpdatedSince(sinceIso: string): Promise<DbOrder[]>;
  getOrderById(id: string): Promise<DbOrder | undefined>;
  getOrderByOperationId(operationId: string): Promise<DbOrder | undefined>;
  getPendingPickupOrders(): Promise<DbOrder[]>;
  getPickupSettings(): Promise<DbPickupSettings | undefined>;
  savePickupSettings(settings: DbPickupSettings): Promise<void>;
  createOrder(order: DbOrder): Promise<boolean>;
  attachPaymentIntent(orderId: string, paymentIntentId: string): Promise<void>;
  reserveOrderInventory(orderId: string, consumption: DbInventoryConsumption[]): Promise<void>;
  updateOrderStatus(orderId: string, status: string, paymentId?: string, paymentStatus?: string, cancellationReason?: string): Promise<void>;
  confirmOrderPayment(orderId: string, paymentId: string, consumption: DbInventoryConsumption[]): Promise<boolean>;
  confirmCashOrderPayment(input: CashPaymentInput): Promise<boolean>;
  /** False until migration 007 is applied (Supabase); always true for the JSON adapter. */
  vouchersAvailable(): Promise<boolean>;
  getChangeVoucher(code: string): Promise<DbChangeVoucher | undefined>;
  getChangeVoucherForOrder(orderId: string): Promise<DbChangeVoucher | undefined>;
  /** Pays the whole balance in cash. Returns the amount paid, 0 for a replay of the same operation. */
  redeemChangeVoucherCash(input: { code: string; operationId: string; amount: number; denominations: Record<string, number>; userId: string }): Promise<number>;
  /** Reserves part of the balance as a discount on an order. False for a replay. */
  applyChangeVoucherToOrder(input: { code: string; orderId: string; operationId: string; amount: number }): Promise<boolean>;
  /** Gives back what a cancelled order took from a voucher. Idempotent; returns the amount released. */
  releaseChangeVoucherForOrder(orderId: string): Promise<number>;
  /** Using vouchers on orders needs migration 008 (orders.voucher_amount). */
  voucherOrdersAvailable(): Promise<boolean>;
  /** Releases reservations older than 10 minutes whose order was never stored. */
  releaseOrphanVoucherRedemptions(code: string): Promise<number>;
  cancelChangeVoucher(input: { code: string; reason: string; userId: string }): Promise<boolean>;
  listChangeVouchers(): Promise<Array<DbChangeVoucher & { redemptions: DbChangeVoucherRedemption[] }>>;
  applyOrderRefund(input: { orderId: string; operationId: string; reason: string; userId: string; cashDenominations?: Record<string, number> }): Promise<boolean>;
  getInventory(): Promise<DbInventoryItem[]>;
  updateInventory(productId: string, stock: number, cost: number): Promise<void>;
  
  getRawInventory(): Promise<DbRawInventory[]>;
  adjustRawInventory(input: { id: string; stock: number; cost: number; reason: string; userId: string; operationId: string }): Promise<boolean>;
  createRawInventoryItem(item: DbRawInventory): Promise<void>;
  getProducts(): Promise<DbProduct[]>;
  createProduct(product: DbProduct): Promise<void>;
  updateProduct(id: string, product: Partial<DbProduct>): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  uploadProductImage(fileName: string, buffer: Buffer, mimeType: string): Promise<string>;
  updateProductPrice(id: string, price: number): Promise<void>;
  updateProductRecipe(productId: string, recipe: Record<string, number>): Promise<void>;
  getCashRegister(): Promise<Record<string, number>>;
  adjustCashRegister(denominations: Record<string, number>): Promise<void>;
  addCashTransaction(transaction: DbCashTransaction): Promise<boolean>;
  getTransactionLedger(): Promise<DbCashTransaction[]>;
  updateCashTransaction(id: number, status: 'deleted' | 'modified', auditReason: string, newAmount?: number): Promise<void>;
  getBakeryBatches(): Promise<DbBakeryBatch[]>;
  addBakeryBatch(batch: DbBakeryBatch): Promise<void>;
  getDailyClosures(): Promise<DbDailyClosure[]>;
  createDailyClosure(closure: DbDailyClosure): Promise<void>;
  getSuppliers(): Promise<DbSupplier[]>;
  createSupplier(supplier: DbSupplier): Promise<void>;
  getPurchases(): Promise<DbPurchase[]>;
  recordPurchase(purchase: DbPurchase): Promise<boolean>;
  getWasteRecords(): Promise<DbWasteRecord[]>;
  recordWaste(record: DbWasteRecord): Promise<boolean>;
  getInventoryMovements(): Promise<DbInventoryMovement[]>;
  getCashSessions(): Promise<DbCashSession[]>;
  getOpenCashSession(): Promise<DbCashSession | undefined>;
  openCashSession(session: DbCashSession): Promise<boolean>;
  closeCashSession(sessionId: string, close: Pick<DbCashSession, 'expectedCash' | 'countedCash' | 'difference' | 'closingDenominations' | 'closedBy' | 'closedAt'>): Promise<boolean>;
  closeCashSessionWithClosing(sessionId: string, close: Pick<DbCashSession, 'expectedCash' | 'countedCash' | 'difference' | 'closingDenominations' | 'closedBy' | 'closedAt'>, closure: DbDailyClosure): Promise<boolean>;
  getProductionBatches(): Promise<DbProductionBatch[]>;
  recordProductionBatch(batch: DbProductionBatch): Promise<boolean>;
}

// 1. JSON Local File Database Adapter (for local development / offline fallback)
export class JsonDbAdapter implements DbAdapter {
  private filePath = process.env.DB_FILE_PATH ? path.resolve(process.env.DB_FILE_PATH) : path.join(__dirname, '..', 'db.json');
  private mutationTail: Promise<void> = Promise.resolve();
  private readonly operationContext = new AsyncLocalStorage<boolean>();

  constructor(filePath?: string) {
    if (filePath) this.filePath = path.resolve(filePath);
    // File reads share mutable adapter state with writes. Serialize both so a
    // concurrent status poll cannot replace an in-progress sale with old data.
    const internal = new Set(['constructor', 'read', 'save', 'serializeMutation', 'confirmOrderPaymentUnsafe']);
    for (const name of Object.getOwnPropertyNames(JsonDbAdapter.prototype)) {
      if (internal.has(name)) continue;
      const method = Reflect.get(this, name) as (...args: unknown[]) => Promise<unknown>;
      Object.defineProperty(this, name, { value: (...args: unknown[]) => this.serializeMutation(() => method.apply(this, args)) });
    }
  }
  private data: {
    pickupSettings?: DbPickupSettings;
    inventoryReservations?: Array<{ orderId: string; consumption: DbInventoryConsumption[] }>;
    changeVouchers?: DbChangeVoucher[];
    changeVoucherRedemptions?: DbChangeVoucherRedemption[];
    orders: DbOrder[];
    inventory: DbInventoryItem[];
    cashRegister: Record<string, number>;
    transactions: DbCashTransaction[];
    bakeryBatches: DbBakeryBatch[];
    dailyClosures: DbDailyClosure[];
    products: DbProduct[];
    rawInventory: DbRawInventory[];
    inventoryMovements: DbInventoryMovement[];
    suppliers: DbSupplier[];
    purchases: DbPurchase[];
    wasteRecords: DbWasteRecord[];
    cashSessions: DbCashSession[];
    productionBatches: DbProductionBatch[];
  } = {
    orders: [],
    inventory: [],
    cashRegister: {},
    transactions: [],
    bakeryBatches: [],
    dailyClosures: [],
    products: [],
    rawInventory: [],
    inventoryMovements: [],
    suppliers: [],
    purchases: [],
    wasteRecords: [],
    cashSessions: [],
    productionBatches: [],
  };

  private async read() {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      this.data = JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.save();
    }
  }

  private async save() {
    for (const ingredient of this.data.rawInventory ?? []) {
      const reserved = (this.data.inventoryReservations ?? []).flatMap((entry) => entry.consumption).filter((entry) => entry.ingredientId === ingredient.id).reduce((sum, entry) => sum + entry.quantity, 0);
      if (ingredient.stock < reserved) throw new Error('El inventario está reservado para un cobro pendiente. Finaliza o cancela ese cobro antes de modificarlo.');
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(this.data, null, 2), 'utf8');
    await fs.rename(temporaryPath, this.filePath);
  }

  private async serializeMutation<T>(mutation: () => Promise<T>): Promise<T> {
    if (this.operationContext.getStore()) return mutation();
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await this.operationContext.run(true, mutation); } finally { release(); }
  }

  async initialize() {
    await this.read();
    
    // Populate default inventory if empty
    if (!this.data.inventory || this.data.inventory.length === 0) {
      const defaultInventory = [
        { product_id: 'espresso', stock: 50, cost: 8.00 },
        { product_id: 'double-espresso', stock: 50, cost: 12.00 },
        { product_id: 'americano', stock: 50, cost: 6.00 },
        { product_id: 'latte', stock: 50, cost: 14.00 },
        { product_id: 'flat-white', stock: 50, cost: 16.00 },
        { product_id: 'matcha-latte', stock: 30, cost: 20.00 },
        { product_id: 'cold-brew', stock: 40, cost: 10.00 },
        { product_id: 'iced-latte', stock: 40, cost: 14.00 },
        { product_id: 'iced-matcha-latte', stock: 30, cost: 20.00 },
        { product_id: 'croissant-mantequilla', stock: 15, cost: 15.00 },
        { product_id: 'pain-au-chocolat', stock: 15, cost: 18.00 },
        { product_id: 'galleta-chocolate', stock: 20, cost: 8.00 }
      ];
      this.data.inventory = defaultInventory;
    }

    // Populate default cash register if empty
    const denoms = [
      'bill_1000', 'bill_500', 'bill_200', 'bill_100', 'bill_50', 'bill_20',
      'coin_20', 'coin_10', 'coin_5', 'coin_2', 'coin_1', 'coin_0_50', 'coin_0_20'
    ];
    if (!this.data.cashRegister) {
      this.data.cashRegister = {};
    }
    denoms.forEach(d => {
      if (this.data.cashRegister[d] === undefined) {
        this.data.cashRegister[d] = 0;
      }
    });

    if (!this.data.transactions) {
      this.data.transactions = [];
    }

    if (!this.data.bakeryBatches) {
      this.data.bakeryBatches = [];
    }
    if (!this.data.dailyClosures) {
      this.data.dailyClosures = [];
    }

    if (!this.data.products || this.data.products.length === 0) {
      const { DEFAULT_PRODUCTS } = await import('./domain/catalog');
      this.data.products = DEFAULT_PRODUCTS;
    }
    if (!this.data.rawInventory || this.data.rawInventory.length === 0) {
      const { DEFAULT_RAW_INVENTORY } = await import('./domain/catalog');
      this.data.rawInventory = DEFAULT_RAW_INVENTORY;
    }
    if (!this.data.inventoryMovements) this.data.inventoryMovements = [];
    if (!this.data.suppliers) this.data.suppliers = [];
    if (!this.data.purchases) this.data.purchases = [];
    if (!this.data.wasteRecords) this.data.wasteRecords = [];
    if (!this.data.cashSessions) this.data.cashSessions = [];
    if (!this.data.productionBatches) this.data.productionBatches = [];

    await this.save();
  }

  async getOrders(): Promise<DbOrder[]> {
    await this.read();
    return this.data.orders || [];
  }

  async getOrderById(id: string): Promise<DbOrder | undefined> {
    return (await this.getOrders()).find((order) => order.id === id);
  }
  async getOrdersUpdatedSince(sinceIso: string): Promise<DbOrder[]> {
    const since = Date.parse(sinceIso);
    return (await this.getOrders()).filter((order) => Date.parse(order.updatedAt ?? order.createdAt ?? '') >= since);
  }

  async getPendingPickupOrders(): Promise<DbOrder[]> {
    await this.read();
    return this.data.orders.filter((order) => order.channel === 'QR_PICKUP' && order.status === 'PENDING_PAYMENT' && order.paymentStatus === 'PENDING').slice(0, 100);
  }

  async getPickupSettings(): Promise<DbPickupSettings | undefined> { await this.read(); return this.data.pickupSettings; }
  async savePickupSettings(settings: DbPickupSettings): Promise<void> { await this.read(); this.data.pickupSettings = settings; await this.save(); }

  async getOrderByOperationId(operationId: string): Promise<DbOrder | undefined> {
    return (await this.getOrders()).find((order) => order.operationId === operationId);
  }

  async createOrder(order: DbOrder): Promise<boolean> {
    return this.serializeMutation(async () => {
      await this.read();
      if (!this.data.orders) this.data.orders = [];
      if (this.data.orders.some((existing) => existing.id === order.id || (order.operationId && existing.operationId === order.operationId))) return false;
      this.data.orders.push(order);
      await this.save();
      return true;
    });
  }

  async updateOrderStatus(orderId: string, status: string, paymentId?: string, paymentStatus?: string, cancellationReason?: string): Promise<void> {
    return this.serializeMutation(async () => {
    await this.read();
    const order = this.data.orders.find(o => o.id === orderId);
    if (order) {
      if (paymentStatus === 'REJECTED' && (order.status !== 'PENDING_PAYMENT' || order.paymentStatus !== 'PENDING')) return;
      order.status = status;
      if (paymentId) {
        order.paymentId = paymentId;
      }
      if (paymentStatus) order.paymentStatus = paymentStatus;
      if (cancellationReason) order.cancellationReason = cancellationReason;
      order.updatedAt = new Date().toISOString();
      if (status === 'CANCELLED' || paymentStatus === 'REJECTED') this.data.inventoryReservations = (this.data.inventoryReservations ?? []).filter((entry) => entry.orderId !== orderId);
      await this.save();
    }
    });
  }

  async reserveOrderInventory(orderId: string, consumption: DbInventoryConsumption[]): Promise<void> {
    await this.read();
    if ((this.data.inventoryReservations ?? []).some((entry) => entry.orderId === orderId)) return;
    for (const item of consumption) {
      const ingredient = this.data.rawInventory.find((entry) => entry.id === item.ingredientId);
      const reserved = (this.data.inventoryReservations ?? []).flatMap((entry) => entry.consumption).filter((entry) => entry.ingredientId === item.ingredientId).reduce((sum, entry) => sum + entry.quantity, 0);
      if (!ingredient || ingredient.stock - reserved < item.quantity) throw new Error('No hay inventario disponible para enviar este pedido a la terminal.');
    }
    this.data.inventoryReservations = [...(this.data.inventoryReservations ?? []), { orderId, consumption }];
    await this.save();
  }

  async attachPaymentIntent(orderId: string, paymentIntentId: string): Promise<void> {
    return this.serializeMutation(async () => {
      await this.read();
      const order = this.data.orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error('Order not found');
      if (order.paymentIntentId && order.paymentIntentId !== paymentIntentId) throw new Error('Payment intent conflict');
      order.paymentIntentId = paymentIntentId;
      order.updatedAt = new Date().toISOString();
      await this.save();
    });
  }

  async confirmOrderPayment(orderId: string, paymentId: string, consumption: DbInventoryConsumption[]): Promise<boolean> {
    return this.serializeMutation(() => this.confirmOrderPaymentUnsafe(orderId, paymentId, consumption));
  }

  private async confirmOrderPaymentUnsafe(orderId: string, paymentId: string, consumption: DbInventoryConsumption[]): Promise<boolean> {
    await this.read();
    const order = this.data.orders.find((entry) => entry.id === orderId);
    if (!order) throw new Error('Order not found');
    if (order.paymentStatus === 'APPROVED' || order.paymentStatus === 'REFUNDED' || order.status === 'CANCELLED') return false;
    this.data.inventoryReservations = (this.data.inventoryReservations ?? []).filter((entry) => entry.orderId !== orderId);
    for (const item of consumption) {
      const inventory = this.data.rawInventory.find((entry) => entry.id === item.ingredientId);
      if (!inventory) throw new Error(`Inventory item not found: ${item.ingredientId}`);
      if (inventory.stock < item.quantity) throw new Error(`Insufficient inventory: ${item.ingredientId}`);
    }
    const now = new Date().toISOString();
    for (const item of consumption) {
      const inventory = this.data.rawInventory.find((entry) => entry.id === item.ingredientId);
      const valuation = applyWasteValue({ stock: inventory!.stock, totalCost: inventory!.cost, quantity: item.quantity });
      inventory!.stock = valuation.stock;
      inventory!.cost = valuation.totalCost;
      this.data.inventoryMovements.push({
        id: `${orderId}:${item.ingredientId}`,
        ingredientId: item.ingredientId,
        quantity: -item.quantity,
        movementType: 'SALE',
        orderId,
        unitCostSnapshot: valuation.unitCost,
        createdAt: now,
      });
    }
    Object.assign(order, { status: 'PAID', paymentStatus: 'APPROVED', paymentId, inventoryAppliedAt: now, updatedAt: now });
    if (order.paymentMethod === 'card') {
      this.data.transactions.push({ id: this.data.transactions.length + 1, type: 'card_payment', amount: order.total, description: `Pago con tarjeta para orden ${order.folio || order.id}`, denominations: {}, created_at: now });
    }
    await this.save();
    return true;
  }

  async confirmCashOrderPayment(input: CashPaymentInput): Promise<boolean> {
    return this.serializeMutation(() => this.confirmCashOrderPaymentUnsafe(input));
  }

  async vouchersAvailable(): Promise<boolean> { return true; }

  async getChangeVoucher(code: string): Promise<DbChangeVoucher | undefined> {
    await this.read();
    const voucher = (this.data.changeVouchers ?? []).find((entry) => entry.code === code);
    return voucher ? { ...voucher } : undefined;
  }

  async getChangeVoucherForOrder(orderId: string): Promise<DbChangeVoucher | undefined> {
    await this.read();
    const voucher = (this.data.changeVouchers ?? []).find((entry) => entry.orderId === orderId);
    return voucher ? { ...voucher } : undefined;
  }

  async redeemChangeVoucherCash(input: { code: string; operationId: string; amount: number; denominations: Record<string, number>; userId: string }): Promise<number> {
    await this.read();
    const redemptions = this.data.changeVoucherRedemptions ??= [];
    if (redemptions.some((entry) => entry.operationId === input.operationId)) return 0;
    if (!this.data.cashSessions.some((session) => !session.closedAt)) throw new Error('cash_session_required');
    const voucher = (this.data.changeVouchers ?? []).find((entry) => entry.code === input.code);
    if (!voucher) throw new Error('voucher_not_found');
    if (voucher.status !== 'ACTIVE' || voucher.balance <= 0) throw new Error('voucher_not_active');
    if (Math.abs(voucher.balance - input.amount) > 0.001) throw new Error('voucher_amount_mismatch');
    for (const [denomination, count] of Object.entries(input.denominations)) {
      if ((this.data.cashRegister[denomination] || 0) < count) throw new Error(`insufficient_cash_denomination:${denomination}`);
    }
    for (const [denomination, count] of Object.entries(input.denominations)) this.data.cashRegister[denomination] -= count;
    const now = new Date().toISOString();
    this.data.transactions.push({ id: this.data.transactions.length + 1, type: 'voucher_payout', amount: input.amount, description: `Pago en efectivo del cupón de cambio ${input.code}`, denominations: input.denominations, created_at: now });
    redemptions.push({ id: randomUUID(), voucherId: voucher.id, kind: 'CASH', amount: input.amount, operationId: input.operationId, status: 'APPLIED', denominations: input.denominations, userId: input.userId, createdAt: now });
    Object.assign(voucher, { balance: 0, status: 'REDEEMED', updatedAt: now });
    await this.save();
    return input.amount;
  }

  async applyChangeVoucherToOrder(input: { code: string; orderId: string; operationId: string; amount: number }): Promise<boolean> {
    await this.read();
    const redemptions = this.data.changeVoucherRedemptions ??= [];
    if (redemptions.some((entry) => entry.operationId === input.operationId)) return false;
    const voucher = (this.data.changeVouchers ?? []).find((entry) => entry.code === input.code);
    if (!voucher) throw new Error('voucher_not_found');
    if (voucher.status !== 'ACTIVE' || voucher.balance + 0.001 < input.amount || input.amount <= 0) throw new Error('voucher_not_active');
    const now = new Date().toISOString();
    redemptions.push({ id: randomUUID(), voucherId: voucher.id, kind: 'ORDER', amount: input.amount, orderId: input.orderId, operationId: input.operationId, status: 'APPLIED', denominations: {}, createdAt: now });
    const balance = Math.round((voucher.balance - input.amount) * 100) / 100;
    Object.assign(voucher, { balance, status: balance <= 0 ? 'REDEEMED' : 'ACTIVE', updatedAt: now });
    await this.save();
    return true;
  }

  async voucherOrdersAvailable(): Promise<boolean> { return true; }

  async releaseOrphanVoucherRedemptions(code: string): Promise<number> {
    await this.read();
    const voucher = (this.data.changeVouchers ?? []).find((entry) => entry.code === code);
    if (!voucher) return 0;
    const cutoff = Date.now() - 10 * 60_000;
    let released = 0;
    for (const redemption of this.data.changeVoucherRedemptions ?? []) {
      if (redemption.voucherId !== voucher.id || redemption.kind !== 'ORDER' || redemption.status !== 'APPLIED') continue;
      if (Date.parse(redemption.createdAt) >= cutoff || this.data.orders.some((order) => order.id === redemption.orderId)) continue;
      redemption.status = 'RELEASED';
      voucher.balance = Math.round((voucher.balance + redemption.amount) * 100) / 100;
      if (voucher.status === 'REDEEMED') voucher.status = 'ACTIVE';
      released += redemption.amount;
    }
    if (released > 0) { voucher.updatedAt = new Date().toISOString(); await this.save(); }
    return released;
  }

  async cancelChangeVoucher(input: { code: string; reason: string; userId: string }): Promise<boolean> {
    await this.read();
    if (input.reason.trim().length < 5) throw new Error('voucher_cancel_reason_required');
    const voucher = (this.data.changeVouchers ?? []).find((entry) => entry.code === input.code);
    if (!voucher) throw new Error('voucher_not_found');
    if (voucher.status === 'CANCELLED') return false;
    const reserved = (this.data.changeVoucherRedemptions ?? []).some((entry) => entry.voucherId === voucher.id && entry.kind === 'ORDER' && entry.status === 'APPLIED' && this.data.orders.some((order) => order.id === entry.orderId && order.status === 'PENDING_PAYMENT'));
    if (reserved) throw new Error('voucher_reserved_by_pending_order');
    if (voucher.status !== 'ACTIVE') throw new Error('voucher_not_active');
    const now = new Date().toISOString();
    Object.assign(voucher, { status: 'CANCELLED', cancelledReason: input.reason.trim(), cancelledBy: input.userId, cancelledAt: now, updatedAt: now });
    await this.save();
    return true;
  }

  async listChangeVouchers(): Promise<Array<DbChangeVoucher & { redemptions: DbChangeVoucherRedemption[] }>> {
    await this.read();
    const redemptions = this.data.changeVoucherRedemptions ?? [];
    return (this.data.changeVouchers ?? []).map((voucher) => ({ ...voucher, redemptions: redemptions.filter((entry) => entry.voucherId === voucher.id).map((entry) => ({ ...entry })) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async releaseChangeVoucherForOrder(orderId: string): Promise<number> {
    await this.read();
    let released = 0;
    const now = new Date().toISOString();
    for (const redemption of this.data.changeVoucherRedemptions ?? []) {
      if (redemption.orderId !== orderId || redemption.kind !== 'ORDER' || redemption.status !== 'APPLIED') continue;
      const voucher = (this.data.changeVouchers ?? []).find((entry) => entry.id === redemption.voucherId);
      if (!voucher) continue;
      redemption.status = 'RELEASED';
      // Never resurrect a voucher an administrator cancelled.
      Object.assign(voucher, { balance: Math.round((voucher.balance + redemption.amount) * 100) / 100, status: voucher.status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE', updatedAt: now });
      released += redemption.amount;
    }
    if (released > 0) await this.save();
    return released;
  }

  private async confirmCashOrderPaymentUnsafe(input: CashPaymentInput): Promise<boolean> {
    await this.read();
    if (!this.data.cashSessions.some((session) => !session.closedAt)) throw new Error('Cash session required');
    const order = this.data.orders.find((entry) => entry.id === input.orderId);
    if (!order) throw new Error('Order not found');
    if (order.paymentStatus === 'APPROVED') return false;
    for (const item of input.consumption) {
      const inventory = this.data.rawInventory.find((entry) => entry.id === item.ingredientId);
      if (!inventory) throw new Error(`Inventory item not found: ${item.ingredientId}`);
      if (inventory.stock < item.quantity) throw new Error(`Insufficient inventory: ${item.ingredientId}`);
    }
    const now = new Date().toISOString();
    for (const item of input.consumption) {
      const inventory = this.data.rawInventory.find((entry) => entry.id === item.ingredientId)!;
      const valuation = applyWasteValue({ stock: inventory.stock, totalCost: inventory.cost, quantity: item.quantity });
      inventory.stock = valuation.stock;
      inventory.cost = valuation.totalCost;
      this.data.inventoryMovements.push({ id: `${input.orderId}:${item.ingredientId}`, ingredientId: item.ingredientId, quantity: -item.quantity, movementType: 'SALE', orderId: input.orderId, unitCostSnapshot: valuation.unitCost, createdAt: now });
    }
    Object.assign(order, { status: 'PAID', paymentStatus: 'APPROVED', paymentId: input.paymentId, inventoryAppliedAt: now, updatedAt: now });
    const nextId = this.data.transactions.length + 1;
    this.data.transactions.push({ id: nextId, type: 'payment', amount: input.receivedAmount, description: `Pago en efectivo recibido para orden ${input.orderId}`, denominations: input.receivedDenominations, created_at: now });
    if (input.changeAmount > 0) this.data.transactions.push({ id: nextId + 1, type: 'change', amount: input.changeAmount, description: `Cambio devuelto para orden ${input.orderId}`, denominations: input.changeDenominations, created_at: now });
    for (const [denomination, count] of Object.entries(input.receivedDenominations)) this.data.cashRegister[denomination] = (this.data.cashRegister[denomination] || 0) + count;
    for (const [denomination, count] of Object.entries(input.changeDenominations)) {
      if ((this.data.cashRegister[denomination] || 0) < count) throw new Error(`Insufficient cash denomination: ${denomination}`);
      this.data.cashRegister[denomination] -= count;
    }
    if (input.voucher) {
      if (input.voucher.amount <= 0) throw new Error('voucher_amount_required');
      (this.data.changeVouchers ??= []).push({ id: randomUUID(), code: input.voucher.code, orderId: input.orderId, amount: input.voucher.amount, balance: input.voucher.amount, status: 'ACTIVE', createdBy: input.voucher.userId, createdAt: now, updatedAt: now });
    }
    await this.save();
    return true;
  }

  async applyOrderRefund(input: { orderId: string; operationId: string; reason: string; userId: string; cashDenominations?: Record<string, number> }): Promise<boolean> {
    return this.serializeMutation(async () => {
      await this.read();
      const order = this.data.orders.find((entry) => entry.id === input.orderId);
      if (!order) throw new Error('Order not found');
      if (order.status === 'REFUNDED' || order.paymentStatus === 'REFUNDED') return false;
      const saleMovements = this.data.inventoryMovements.filter((entry) => entry.orderId === order.id && entry.movementType === 'SALE');
      const now = new Date().toISOString();
      for (const movement of saleMovements) {
        const inventory = this.data.rawInventory.find((entry) => entry.id === movement.ingredientId);
        if (!inventory) throw new Error(`Inventory item not found: ${movement.ingredientId}`);
        const quantity = Math.abs(movement.quantity);
        inventory.stock += quantity;
        inventory.cost = Math.round((inventory.cost + quantity * movement.unitCostSnapshot) * 100) / 100;
        this.data.inventoryMovements.push({ id: `${input.operationId}:${movement.ingredientId}`, ingredientId: movement.ingredientId, quantity, movementType: 'RETURN', reason: input.reason, userId: input.userId, orderId: order.id, operationId: input.operationId, unitCostSnapshot: movement.unitCostSnapshot, createdAt: now });
      }
      if (order.paymentMethod === 'cash') {
        if (!input.cashDenominations) throw new Error('Cash denominations required');
        for (const [denomination, count] of Object.entries(input.cashDenominations)) {
          if ((this.data.cashRegister[denomination] || 0) < count) throw new Error(`Insufficient cash denomination: ${denomination}`);
          this.data.cashRegister[denomination] -= count;
        }
      }
      this.data.transactions.push({ id: this.data.transactions.length + 1, type: 'refund', amount: order.paymentMethod === 'cash' ? amountDue(order) : 0, description: `Devolución de orden ${order.folio || order.id}: ${input.reason}`, denominations: input.cashDenominations || {}, created_at: now });
      Object.assign(order, { status: 'REFUNDED', paymentStatus: 'REFUNDED', updatedAt: now });
      await this.save();
      return true;
    });
  }

  async getInventory(): Promise<DbInventoryItem[]> {
    await this.read();
    return this.data.inventory || [];
  }

  async updateInventory(productId: string, stock: number, cost: number): Promise<void> {
    await this.read();
    if (!this.data.inventory) this.data.inventory = [];
    const item = this.data.inventory.find(i => i.product_id === productId);
    if (item) {
      item.stock = stock;
      item.cost = cost;
    } else {
      this.data.inventory.push({ product_id: productId, stock, cost });
    }
    await this.save();
  }

  async getRawInventory(): Promise<import('./db').DbRawInventory[]> {
    await this.read();
    return this.data.rawInventory.map((ingredient) => ({ ...ingredient, reservedStock: (this.data.inventoryReservations ?? []).flatMap((entry) => entry.consumption).filter((entry) => entry.ingredientId === ingredient.id).reduce((sum, entry) => sum + entry.quantity, 0) }));
  }
  async adjustRawInventory(input: { id: string; stock: number; cost: number; reason: string; userId: string; operationId: string }): Promise<boolean> {
    return this.serializeMutation(async () => {
      await this.read();
      if (this.data.inventoryMovements.some((movement) => movement.operationId === input.operationId)) return false;
      const inventory = this.data.rawInventory.find((item) => item.id === input.id);
      if (!inventory) throw new Error(`Inventory item not found: ${input.id}`);
      const previousStock = inventory.stock;
      const previousCost = inventory.cost;
      inventory.stock = input.stock;
      inventory.cost = input.cost;
      this.data.inventoryMovements.push({
        id: input.operationId,
        ingredientId: input.id,
        quantity: input.stock - previousStock,
        movementType: 'ADJUSTMENT',
        reason: input.reason,
        userId: input.userId,
        operationId: input.operationId,
        unitCostSnapshot: previousStock > 0 ? previousCost / previousStock : 0,
        createdAt: new Date().toISOString(),
      });
      await this.save();
      return true;
    });
  }
  async createRawInventoryItem(item: import('./db').DbRawInventory): Promise<void> { await this.read(); if (!this.data.rawInventory.some((entry) => entry.id === item.id)) this.data.rawInventory.push(item); await this.save(); }
  async getProducts(): Promise<DbProduct[]> { await this.read(); return this.data.products; }
  async createProduct(product: DbProduct): Promise<void> { await this.read(); this.data.products.push(product); await this.save(); }
  async updateProduct(id: string, product: Partial<DbProduct>): Promise<void> { await this.read(); const index = this.data.products.findIndex((entry) => entry.id === id); if (index >= 0) this.data.products[index] = { ...this.data.products[index], ...product }; await this.save(); }
  async deleteProduct(id: string): Promise<void> { await this.read(); this.data.products = this.data.products.filter((entry) => entry.id !== id); await this.save(); }
  async uploadProductImage(_fileName: string, buffer: Buffer, mimeType: string): Promise<string> {
    const directory = path.join(path.dirname(this.filePath), 'rofe-product-images');
    await fs.mkdir(directory, { recursive: true });
    const fileName = `${randomUUID()}.${mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]}`;
    await fs.writeFile(path.join(directory, fileName), buffer);
    return `/api/product-images/${fileName}`;
  }
  async updateProductPrice(id: string, price: number): Promise<void> { await this.updateProduct(id, { price }); }
  async updateProductRecipe(productId: string, recipe: Record<string, number>): Promise<void> { await this.updateProduct(productId, { recipe }); }

  async getCashRegister(): Promise<Record<string, number>> {
    await this.read();
    return this.data.cashRegister || {};
  }

  async adjustCashRegister(denominations: Record<string, number>): Promise<void> {
    await this.read();
    this.data.cashRegister = { ...this.data.cashRegister, ...denominations };
    
    // Add adjustment transaction
    let totalAdjusted = 0;
    const values: Record<string, number> = {
      bill_1000: 1000, bill_500: 500, bill_200: 200, bill_100: 100, bill_50: 50, bill_20: 20,
      coin_20: 20, coin_10: 10, coin_5: 5, coin_2: 2, coin_1: 1, coin_0_50: 0.5, coin_0_20: 0.2
    };
    Object.entries(denominations).forEach(([denom, count]) => {
      totalAdjusted += count * (values[denom] || 0);
    });

    this.data.transactions.push({
      type: 'adjustment',
      amount: totalAdjusted,
      description: 'Ajuste manual del administrador',
      denominations,
      created_at: new Date().toISOString()
    });

    await this.save();
  }

  async addCashTransaction(transaction: DbCashTransaction): Promise<boolean> {
    return this.serializeMutation(async () => {
      await this.read();
      if (!this.data.transactions) this.data.transactions = [];
      if (transaction.operationId && this.data.transactions.some((entry) => entry.operationId === transaction.operationId)) return false;
      const subtractsCash = transaction.type === 'change' || transaction.type === 'manual_expense' || transaction.type === 'manual_investment' || transaction.type === 'refund';
      if (subtractsCash) {
        for (const [denomination, count] of Object.entries(transaction.denominations)) {
          if ((this.data.cashRegister[denomination] || 0) < count) throw new Error(`Insufficient cash denomination: ${denomination}`);
        }
      }
      const newTx = { ...transaction, id: this.data.transactions.length + 1, created_at: new Date().toISOString() };
      this.data.transactions.push(newTx);
      for (const [denomination, count] of Object.entries(transaction.denominations)) {
        this.data.cashRegister[denomination] = (this.data.cashRegister[denomination] || 0) + count * (subtractsCash ? -1 : 1);
      }
      await this.save();
      return true;
    });
  }

  async getTransactionLedger(): Promise<DbCashTransaction[]> {
    await this.read();
    return this.data.transactions || [];
  }

  async updateCashTransaction(id: number, status: 'deleted' | 'modified', auditReason: string, newAmount?: number): Promise<void> {
    await this.read();
    const tx = this.data.transactions.find(t => t.id === id);
    if (tx) {
      tx.status = status;
      tx.audit_reason = auditReason;
      if (status === 'modified' && newAmount !== undefined) {
        tx.original_amount = tx.amount;
        tx.amount = newAmount;
      }
      await this.save();
    }
  }

  async getBakeryBatches(): Promise<DbBakeryBatch[]> {
    await this.read();
    return this.data.bakeryBatches || [];
  }

  async addBakeryBatch(batch: DbBakeryBatch): Promise<void> {
    await this.read();
    if (!this.data.bakeryBatches) this.data.bakeryBatches = [];
    
    const newBatch = {
      ...batch,
      id: this.data.bakeryBatches.length + 1
    };
    this.data.bakeryBatches.push(newBatch);
    await this.save();
  }

  async getDailyClosures(): Promise<DbDailyClosure[]> {
    await this.read();
    return this.data.dailyClosures || [];
  }

  async createDailyClosure(closure: DbDailyClosure): Promise<void> {
    await this.read();
    if (!this.data.dailyClosures) this.data.dailyClosures = [];
    this.data.dailyClosures.push(closure);
    await this.save();
  }

  async getSuppliers(): Promise<DbSupplier[]> { await this.read(); return this.data.suppliers; }
  async createSupplier(supplier: DbSupplier): Promise<void> {
    await this.read();
    if (this.data.suppliers.some((entry) => entry.id === supplier.id)) return;
    this.data.suppliers.push(supplier);
    await this.save();
  }
  async getPurchases(): Promise<DbPurchase[]> { await this.read(); return this.data.purchases; }
  async recordPurchase(purchase: DbPurchase): Promise<boolean> {
    return this.serializeMutation(() => this.recordPurchaseUnsafe(purchase));
  }

  private async recordPurchaseUnsafe(purchase: DbPurchase): Promise<boolean> {
    await this.read();
    if (this.data.purchases.some((entry) => entry.operationId === purchase.operationId)) return false;
    for (const line of purchase.items) {
      if (!this.data.rawInventory.some((entry) => entry.id === line.ingredientId)) throw new Error(`Inventory item not found: ${line.ingredientId}`);
    }
    for (const line of purchase.items) {
      const inventory = this.data.rawInventory.find((entry) => entry.id === line.ingredientId)!;
      const valuation = applyPurchaseValue({ stock: inventory.stock, totalCost: inventory.cost, addedStock: line.quantity, addedCost: line.subtotal });
      inventory.stock = valuation.stock;
      inventory.cost = valuation.totalCost;
      this.data.inventoryMovements.push({
        id: `${purchase.id}:${line.ingredientId}`,
        ingredientId: line.ingredientId,
        quantity: line.quantity,
        movementType: 'PURCHASE',
        reason: purchase.invoiceReference || purchase.notes,
        userId: purchase.createdBy,
        purchaseId: purchase.id,
        operationId: purchase.operationId,
        unitCostSnapshot: line.unitCost,
        createdAt: purchase.purchasedAt,
      });
    }
    if (purchase.paymentMethod === 'cash') {
      if (!this.data.cashSessions.some((session) => !session.closedAt)) throw new Error('cash_session_required');
      for (const [key, count] of Object.entries(purchase.cashDenominations ?? {})) {
        if ((this.data.cashRegister[key] ?? 0) < count) throw new Error(`Insufficient cash denomination: ${key}`);
        this.data.cashRegister[key] = (this.data.cashRegister[key] ?? 0) - count;
      }
      this.data.transactions.push({ id: this.data.transactions.length + 1, type: 'manual_expense', amount: purchase.total, description: `Compra ${purchase.invoiceReference || purchase.id}`, denominations: purchase.cashDenominations ?? {}, operationId: purchase.operationId, createdBy: purchase.createdBy, created_at: purchase.purchasedAt });
    }
    this.data.purchases.push(purchase);
    await this.save();
    return true;
  }
  async getWasteRecords(): Promise<DbWasteRecord[]> { await this.read(); return this.data.wasteRecords; }
  async recordWaste(record: DbWasteRecord): Promise<boolean> {
    return this.serializeMutation(() => this.recordWasteUnsafe(record));
  }

  private async recordWasteUnsafe(record: DbWasteRecord): Promise<boolean> {
    await this.read();
    if (this.data.wasteRecords.some((entry) => entry.operationId === record.operationId)) return false;
    const inventory = this.data.rawInventory.find((entry) => entry.id === record.ingredientId);
    if (!inventory) throw new Error(`Inventory item not found: ${record.ingredientId}`);
    if (inventory.stock < record.quantity) throw new Error(`Insufficient inventory: ${record.ingredientId}`);
    const valuation = applyWasteValue({ stock: inventory.stock, totalCost: inventory.cost, quantity: record.quantity });
    inventory.stock = valuation.stock;
    inventory.cost = valuation.totalCost;
    const saved = { ...record, costSnapshot: valuation.costSnapshot };
    this.data.wasteRecords.push(saved);
    this.data.inventoryMovements.push({
      id: `${record.id}:${record.ingredientId}`,
      ingredientId: record.ingredientId,
      quantity: -record.quantity,
      movementType: 'WASTE',
      reason: record.reason,
      userId: record.userId,
      operationId: record.operationId,
      unitCostSnapshot: valuation.unitCost,
      createdAt: record.createdAt,
    });
    await this.save();
    return true;
  }
  async getInventoryMovements(): Promise<DbInventoryMovement[]> { await this.read(); return this.data.inventoryMovements; }
  async getCashSessions(): Promise<DbCashSession[]> { await this.read(); return [...this.data.cashSessions].sort((a, b) => b.openedAt.localeCompare(a.openedAt)); }
  async getOpenCashSession(): Promise<DbCashSession | undefined> { await this.read(); return this.data.cashSessions.find((session) => !session.closedAt); }
  async openCashSession(session: DbCashSession): Promise<boolean> {
    return this.serializeMutation(() => this.openCashSessionUnsafe(session));
  }

  private async openCashSessionUnsafe(session: DbCashSession): Promise<boolean> {
    await this.read();
    if (this.data.cashSessions.some((entry) => !entry.closedAt || entry.id === session.id)) return false;
    this.data.cashSessions.push(session);
    this.data.cashRegister = { ...session.openingDenominations };
    await this.save();
    return true;
  }
  async closeCashSession(sessionId: string, close: Pick<DbCashSession, 'expectedCash' | 'countedCash' | 'difference' | 'closingDenominations' | 'closedBy' | 'closedAt'>): Promise<boolean> {
    return this.serializeMutation(() => this.closeCashSessionUnsafe(sessionId, close));
  }

  private async closeCashSessionUnsafe(sessionId: string, close: Pick<DbCashSession, 'expectedCash' | 'countedCash' | 'difference' | 'closingDenominations' | 'closedBy' | 'closedAt'>): Promise<boolean> {
    await this.read();
    const session = this.data.cashSessions.find((entry) => entry.id === sessionId);
    if (!session || session.closedAt) return false;
    Object.assign(session, close);
    this.data.cashRegister = { ...(close.closingDenominations || {}) };
    await this.save();
    return true;
  }
  async closeCashSessionWithClosing(sessionId: string, close: Pick<DbCashSession, 'expectedCash' | 'countedCash' | 'difference' | 'closingDenominations' | 'closedBy' | 'closedAt'>, closure: DbDailyClosure): Promise<boolean> {
    return this.serializeMutation(async () => {
      await this.read();
      const session = this.data.cashSessions.find((entry) => entry.id === sessionId);
      if (!session || session.closedAt) return false;
      Object.assign(session, close);
      this.data.cashRegister = { ...(close.closingDenominations || {}) };
      if (!this.data.dailyClosures.some((entry) => entry.id === closure.id)) this.data.dailyClosures.push(closure);
      await this.save();
      return true;
    });
  }
  async getProductionBatches(): Promise<DbProductionBatch[]> { await this.read(); return [...this.data.productionBatches].sort((a, b) => b.producedAt.localeCompare(a.producedAt)); }
  async recordProductionBatch(batch: DbProductionBatch): Promise<boolean> {
    return this.serializeMutation(async () => {
      await this.read();
      if (this.data.productionBatches.some((entry) => entry.operationId === batch.operationId)) return false;
      for (const line of batch.consumption) {
        const inventory = this.data.rawInventory.find((entry) => entry.id === line.ingredientId);
        if (!inventory || inventory.stock < line.quantity) throw new Error(`Insufficient inventory: ${line.ingredientId}`);
      }
      let totalCost = 0;
      for (const line of batch.consumption) {
        const inventory = this.data.rawInventory.find((entry) => entry.id === line.ingredientId)!;
        const valuation = applyWasteValue({ stock: inventory.stock, totalCost: inventory.cost, quantity: line.quantity });
        inventory.stock = valuation.stock;
        inventory.cost = valuation.totalCost;
        totalCost += valuation.costSnapshot;
        this.data.inventoryMovements.push({ id: `${batch.operationId}:${line.ingredientId}`, ingredientId: line.ingredientId, quantity: -line.quantity, movementType: 'PRODUCTION', reason: `Lote ${batch.id}`, userId: batch.responsibleUserId, operationId: batch.operationId, unitCostSnapshot: valuation.unitCost, createdAt: batch.producedAt });
      }
      const netQuantity = batch.quantityProduced - batch.wasteQuantity;
      const finished = this.data.inventory.find((entry) => entry.product_id === batch.productId);
      if (finished) {
        const previousValue = finished.stock * finished.cost;
        finished.stock += netQuantity;
        finished.cost = finished.stock > 0 ? (previousValue + totalCost) / finished.stock : 0;
      } else this.data.inventory.push({ product_id: batch.productId, stock: netQuantity, cost: netQuantity > 0 ? totalCost / netQuantity : 0 });
      this.data.productionBatches.push({ ...batch, totalCost: toRoundedMoney(totalCost) });
      await this.save();
      return true;
    });
  }
}

function toRoundedMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

// Export singleton instance based on environment variables
const configuredEnv = getEnv();
const supabaseUrl = configuredEnv.SUPABASE_URL;
const supabaseKey = configuredEnv.SUPABASE_SERVICE_KEY;

export const db: DbAdapter = (supabaseUrl && supabaseKey) 
  ? new SupabaseDbAdapter(supabaseUrl, supabaseKey) 
  : new JsonDbAdapter();
