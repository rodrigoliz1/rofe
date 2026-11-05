import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DbPickupSettings } from './db';
import type { DbAdapter, DbInventoryItem, DbCashTransaction, DbBakeryBatch, DbOrder, DbInventoryConsumption, DbSupplier, DbPurchase, DbWasteRecord, DbInventoryMovement, DbCashSession, DbDailyClosure, DbProductionBatch } from './db';

export class SupabaseDbAdapter implements DbAdapter {
  private supabase: SupabaseClient;

  constructor(url: string, key: string) {
    this.supabase = createClient(url, key);
  }

  async initialize(): Promise<void> {
    const version = await this.supabase.rpc('rofe_schema_version');
    if (version.error && version.status === 0) throw new Error('No se pudo conectar con Supabase. Comprueba la conexión a internet y que el proyecto esté disponible.');
    if (version.error || version.data !== 5) throw new Error('Aplica las migraciones de ROFÉ antes de iniciar el servidor (versión 5 requerida).');
    const criticalTables = [
      'products', 'orders', 'inventory', 'raw_inventory', 'cash_register', 'cash_transactions', 'cash_sessions',
      'cash_movements', 'daily_closures', 'daily_closings', 'suppliers', 'purchases', 'purchase_items',
      'inventory_movements', 'inventory_reservations', 'waste_records', 'production_batches', 'pickup_settings',
    ] as const;
    for (const table of criticalTables) {
      const { error } = await this.supabase.from(table).select('*').limit(1);
      if (error) throw new Error(`Supabase no está listo (${table}): ${error.message}`);
    }
    console.log('Supabase connection successful.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async readAll(table: string, select = '*'): Promise<Array<Record<string, any>>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Array<Record<string, any>> = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.supabase.from(table).select(select).order('id', { ascending: true }).range(offset, offset + 499);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }

  async getOrders(): Promise<DbOrder[]> {
    const data = await this.readAll('orders');

    return data.map(mapOrder);
  }

  async getOrdersUpdatedSince(sinceIso: string): Promise<DbOrder[]> {
    const { data, error } = await this.supabase.from('orders').select('*').gte('updated_at', sinceIso).order('updated_at', { ascending: false }).limit(500);
    if (error) throw error;
    return data.map(mapOrder);
  }

  async getOrderById(id: string): Promise<DbOrder | undefined> {
    const { data, error } = await this.supabase.from('orders').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapOrder(data) : undefined;
  }
  async getOrderByOperationId(operationId: string): Promise<DbOrder | undefined> {
    const { data, error } = await this.supabase.from('orders').select('*').eq('operation_id', operationId).maybeSingle();
    if (error) throw error;
    return data ? mapOrder(data) : undefined;
  }

  async getPendingPickupOrders(): Promise<DbOrder[]> {
    const { data, error } = await this.supabase.from('orders').select('*').eq('channel', 'QR_PICKUP').eq('status', 'PENDING_PAYMENT').eq('payment_status', 'PENDING').order('created_at').limit(100);
    if (error) throw error;
    return data.map(mapOrder);
  }

  async getPickupSettings(): Promise<DbPickupSettings | undefined> {
    const { data, error } = await this.supabase.from('pickup_settings').select('settings').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data?.settings as DbPickupSettings | undefined;
  }
  async savePickupSettings(settings: DbPickupSettings): Promise<void> {
    const { error } = await this.supabase.from('pickup_settings').upsert({ id: 1, settings });
    if (error) throw error;
  }

  async createOrder(order: DbOrder): Promise<boolean> {
    const { error } = await this.supabase.from('orders').insert({
      id: order.id,
      folio: order.folio || order.id,
      operation_id: order.operationId || null,
      device_id: order.deviceId || null,
      channel: order.channel || 'POS',
      payment_provider: order.paymentProvider || (order.paymentMethod === 'card' ? 'MERCADO_PAGO' : null),
      pickup: order.pickup || null,
      barista_id: order.baristaId || null,
      customer_name: order.customerName,
      items: order.items,
      subtotal: order.subtotal ?? order.total,
      discount: order.discount ?? 0,
      discount_type: order.discountType || null,
      discount_reason: order.discountReason || null,
      discount_authorized_by: order.discountAuthorizedBy || null,
      tax: order.tax ?? 0,
      total: order.total,
      status: order.status,
      payment_status: order.paymentStatus || null,
      payment_method: order.paymentMethod,
      payment_id: order.paymentId || null,
      payment_intent_id: order.paymentIntentId || null,
      notes: order.notes || null,
      created_at: new Date(order.createdAt).toISOString(),
      updated_at: new Date(order.updatedAt || order.createdAt).toISOString()
    });

    if (error?.code === '23505') return false;
    if (error) throw error;
    return true;
  }

  async updateOrderStatus(orderId: string, status: string, paymentId?: string, paymentStatus?: string, cancellationReason?: string): Promise<void> {
    const payload: Record<string, string> = { status };
    if (paymentId) payload.payment_id = paymentId;
    if (paymentStatus) payload.payment_status = paymentStatus;
    if (cancellationReason) payload.cancellation_reason = cancellationReason;
    payload.updated_at = new Date().toISOString();

    let query = this.supabase.from('orders').update(payload).eq('id', orderId);
    if (paymentStatus === 'REJECTED') query = query.eq('status', 'PENDING_PAYMENT').eq('payment_status', 'PENDING');
    const { error } = await query;
    if (error) throw error;
  }

  async reserveOrderInventory(orderId: string, consumption: DbInventoryConsumption[]): Promise<void> {
    const { error } = await this.supabase.rpc('reserve_order_inventory', { p_order_id: orderId, p_consumption: consumption });
    if (error) throw error;
  }

  async attachPaymentIntent(orderId: string, paymentIntentId: string): Promise<void> {
    const { error } = await this.supabase.from('orders').update({ payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() })
      .eq('id', orderId).or(`payment_intent_id.is.null,payment_intent_id.eq.${paymentIntentId}`);
    if (error) throw error;
  }

  async confirmOrderPayment(orderId: string, paymentId: string, consumption: DbInventoryConsumption[]): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('confirm_order_payment', {
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_consumption: consumption,
    });
    if (error) throw error;
    return Boolean(data);
  }

  async confirmCashOrderPayment(input: { orderId: string; paymentId: string; consumption: DbInventoryConsumption[]; receivedAmount: number; changeAmount: number; receivedDenominations: Record<string, number>; changeDenominations: Record<string, number> }): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('confirm_cash_payment', {
      p_order_id: input.orderId,
      p_payment_id: input.paymentId,
      p_consumption: input.consumption,
      p_received_amount: input.receivedAmount,
      p_change_amount: input.changeAmount,
      p_received_denominations: input.receivedDenominations,
      p_change_denominations: input.changeDenominations,
    });
    if (error) throw error;
    return Boolean(data);
  }

  async applyOrderRefund(input: { orderId: string; operationId: string; reason: string; userId: string; cashDenominations?: Record<string, number> }): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('apply_order_refund', {
      p_order_id: input.orderId,
      p_operation_id: input.operationId,
      p_reason: input.reason,
      p_user_id: input.userId,
      p_cash_denominations: input.cashDenominations || {},
    });
    if (error) throw error;
    return Boolean(data);
  }

  async getInventory(): Promise<DbInventoryItem[]> {
    const { data, error } = await this.supabase.from('inventory').select('*');
    if (error) throw error;

    return data.map((row) => ({
      product_id: row.product_id,
      stock: row.stock,
      cost: Number(row.cost),
    }));
  }

  async updateInventory(productId: string, stock: number, cost: number): Promise<void> {
    const { error } = await this.supabase.from('inventory').upsert({
      product_id: productId,
      stock,
      cost
    });
    if (error) throw error;
  }

  async getRawInventory(): Promise<import('./db').DbRawInventory[]> {
    const { data, error } = await this.supabase.from('raw_inventory').select('*');
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      stock: Number(row.stock),
      cost: Number(row.cost),
      minStock: row.min_stock == null ? 0 : Number(row.min_stock),
      reservedStock: Number(row.reserved_stock ?? 0),
    }));
  }

  async adjustRawInventory(input: { id: string; stock: number; cost: number; reason: string; userId: string; operationId: string }): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('record_inventory_adjustment', {
      p_ingredient_id: input.id,
      p_stock: input.stock,
      p_cost: input.cost,
      p_reason: input.reason,
      p_user_id: input.userId,
      p_operation_id: input.operationId,
    });
    if (error) throw error;
    return Boolean(data);
  }

  async createRawInventoryItem(item: import('./db').DbRawInventory): Promise<void> {
    const { error } = await this.supabase.from('raw_inventory').insert({
      id: item.id,
      name: item.name,
      unit: item.unit,
      stock: item.stock,
      cost: item.cost
    });
    if (error) throw error;
  }

  async getProducts(): Promise<import('./db').DbProduct[]> {
    const { data, error } = await this.supabase.from('products').select('*');
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      category: row.category,
      icon: row.icon,
      customizable: row.customizable,
      image: row.image,
      recipe: row.recipe,
      custom_variants: row.custom_variants || [],
    }));
  }

  async updateProductPrice(id: string, price: number): Promise<void> {
    const { error } = await this.supabase.from('products').update({ price }).eq('id', id);
    if (error) throw error;
  }

  async updateProductRecipe(productId: string, recipe: Record<string, number>): Promise<void> {
    const { error } = await this.supabase.from('products').update({ recipe }).eq('id', productId);
    if (error) throw error;
  }

  async getCashRegister(): Promise<Record<string, number>> {
    const { data, error } = await this.supabase.from('cash_register').select('*');
    if (error) throw error;

    const reg: Record<string, number> = {};
    data.forEach((row) => {
      reg[row.denomination] = row.count;
    });
    return reg;
  }

  async adjustCashRegister(denominations: Record<string, number>): Promise<void> {
    let totalAdjusted = 0;
    const values: Record<string, number> = {
      bill_1000: 1000, bill_500: 500, bill_200: 200, bill_100: 100, bill_50: 50, bill_20: 20,
      coin_20: 20, coin_10: 10, coin_5: 5, coin_2: 2, coin_1: 1, coin_0_50: 0.5, coin_0_20: 0.2
    };

    for (const [denom, count] of Object.entries(denominations)) {
      await this.supabase.from('cash_register').upsert({ denomination: denom, count });
      totalAdjusted += count * (values[denom] || 0);
    }

    // Add transaction log
    await this.supabase.from('cash_transactions').insert({
      type: 'adjustment',
      amount: totalAdjusted,
      description: 'Ajuste manual del administrador',
      denominations: denominations,
    });
  }

  async addCashTransaction(transaction: DbCashTransaction): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('record_cash_movement', { p_transaction: transaction });
    if (error) throw error;
    return Boolean(data);
  }

  async getTransactionLedger(): Promise<DbCashTransaction[]> {
    const data = await this.readAll('cash_transactions');

    return data.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      description: row.description,
      denominations: row.denominations,
      created_at: row.created_at,
      status: row.status,
      audit_reason: row.audit_reason,
      original_amount: row.original_amount ? Number(row.original_amount) : undefined,
      operationId: row.operation_id || undefined,
      createdBy: row.created_by || undefined,
      cashSessionId: row.cash_session_id || undefined,
    }));
  }

  async updateCashTransaction(id: number, status: 'deleted' | 'modified', auditReason: string, newAmount?: number): Promise<void> {
    const payload: Record<string, string | number> = { status, audit_reason: auditReason };
    if (status === 'modified' && newAmount !== undefined) {
      // Fetch current to save original
      const { data: currentTx } = await this.supabase.from('cash_transactions').select('amount').eq('id', id).single();
      if (currentTx) {
        payload.original_amount = currentTx.amount;
        payload.amount = newAmount;
      }
    }

    const { error } = await this.supabase.from('cash_transactions').update(payload).eq('id', id);
    if (error) throw error;
  }

  async getBakeryBatches(): Promise<DbBakeryBatch[]> {
    const { data, error } = await this.supabase.from('bakery_batches').select('*').order('added_at', { ascending: true });
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      quantity: row.quantity,
      added_at: row.added_at,
      expires_at: row.expires_at,
    }));
  }

  async addBakeryBatch(batch: DbBakeryBatch): Promise<void> {
    const { error } = await this.supabase.from('bakery_batches').insert({
      product_id: batch.product_id,
      quantity: batch.quantity,
      added_at: batch.added_at,
      expires_at: batch.expires_at,
    });
    if (error) throw error;
  }
  // Daily Closures methods
  async getDailyClosures(): Promise<import('./db').DbDailyClosure[]> {
    const { data, error } = await this.supabase
      .from('daily_closures')
      .select('*')
      .order('closed_at', { ascending: false });
    
    if (error) throw error;
    
    return data.map(row => ({
      id: row.id,
      closed_at: row.closed_at,
      total_sales: parseFloat(row.total_sales),
      total_income: parseFloat(row.total_income),
      total_costs: parseFloat(row.total_costs),
      net_profit: parseFloat(row.net_profit),
      cash_start: parseFloat(row.cash_start),
      cash_end: parseFloat(row.cash_end),
      products_sold: typeof row.products_sold === 'string' ? JSON.parse(row.products_sold) : row.products_sold,
      notes: row.notes
    }));
  }

  async createDailyClosure(closure: import('./db').DbDailyClosure): Promise<void> {
    const { error } = await this.supabase.from('daily_closures').insert([{
      closed_at: closure.closed_at,
      total_sales: closure.total_sales,
      total_income: closure.total_income,
      total_costs: closure.total_costs,
      net_profit: closure.net_profit,
      cash_start: closure.cash_start,
      cash_end: closure.cash_end,
      products_sold: closure.products_sold,
      notes: closure.notes
    }]);
    
    if (error) throw error;
  }


  async createProduct(product: import('./db').DbProduct): Promise<void> {
    const { error } = await this.supabase.from('products').insert(product);
    if (error) throw error;
  }

  async updateProduct(id: string, product: Partial<import('./db').DbProduct>): Promise<void> {
    const { error } = await this.supabase.from('products').update(product).eq('id', id);
    if (error) throw error;
  }

  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  }

  async uploadProductImage(fileName: string, buffer: Buffer, mimeType: string): Promise<string> {
    const path = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const { error } = await this.supabase.storage
      .from('product_images')
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    
    if (error) throw error;

    const { data: publicData } = this.supabase.storage
      .from('product_images')
      .getPublicUrl(path);
      
    return publicData.publicUrl;
  }

  async getSuppliers(): Promise<DbSupplier[]> {
    const { data, error } = await this.supabase.from('suppliers').select('*').order('name');
    if (error) throw error;
    return data.map((row) => ({ id: row.id, name: row.name, contactName: row.contact_name || undefined, phone: row.phone || undefined, email: row.email || undefined, notes: row.notes || undefined, active: row.active, createdAt: row.created_at }));
  }

  async createSupplier(supplier: DbSupplier): Promise<void> {
    const { error } = await this.supabase.from('suppliers').insert({ id: supplier.id, name: supplier.name, contact_name: supplier.contactName || null, phone: supplier.phone || null, email: supplier.email || null, notes: supplier.notes || null, active: supplier.active, created_at: supplier.createdAt });
    if (error) throw error;
  }

  async getPurchases(): Promise<DbPurchase[]> {
    const data = await this.readAll('purchases', '*,purchase_items(*)');
    return data.map((row) => ({
      id: row.id, supplierId: row.supplier_id || undefined, invoiceReference: row.invoice_reference || undefined,
      paymentMethod: row.payment_method, total: Number(row.total), notes: row.notes || undefined,
      purchasedAt: row.purchased_at, createdBy: row.created_by, operationId: row.operation_id,
      items: (row.purchase_items || []).map((line: Record<string, unknown>) => ({ ingredientId: String(line.ingredient_id), quantity: Number(line.quantity), unit: String(line.unit), unitCost: Number(line.unit_cost), subtotal: Number(line.subtotal) })),
    }));
  }

  async recordPurchase(purchase: DbPurchase): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('record_inventory_purchase', { p_purchase: purchase });
    if (error) throw error;
    return Boolean(data);
  }

  async getWasteRecords(): Promise<DbWasteRecord[]> {
    const data = await this.readAll('waste_records');
    return data.map((row) => ({ id: row.id, ingredientId: row.ingredient_id, quantity: Number(row.quantity), costSnapshot: Number(row.cost_snapshot), reason: row.reason, userId: row.user_id, operationId: row.operation_id, createdAt: row.created_at }));
  }

  async recordWaste(record: DbWasteRecord): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('record_inventory_waste', { p_waste: record });
    if (error) throw error;
    return Boolean(data);
  }

  async getInventoryMovements(): Promise<DbInventoryMovement[]> {
    const data = await this.readAll('inventory_movements');
    return data.map((row) => ({ id: row.id, ingredientId: row.ingredient_id, quantity: Number(row.quantity), movementType: row.movement_type, reason: row.reason || undefined, userId: row.user_id || undefined, deviceId: row.device_id || undefined, orderId: row.order_id || undefined, purchaseId: row.purchase_id || undefined, operationId: row.operation_id || undefined, unitCostSnapshot: Number(row.unit_cost_snapshot), createdAt: row.created_at }));
  }

  async getCashSessions(): Promise<DbCashSession[]> {
    const data = await this.readAll('cash_sessions');
    return data.map(mapCashSession);
  }

  async getOpenCashSession(): Promise<DbCashSession | undefined> {
    const { data, error } = await this.supabase.from('cash_sessions').select('*').is('closed_at', null).maybeSingle();
    if (error) throw error;
    return data ? mapCashSession(data) : undefined;
  }

  async openCashSession(session: DbCashSession): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('open_cash_session', { p_session: session });
    if (error) throw error;
    return Boolean(data);
  }

  async closeCashSession(sessionId: string, close: Pick<DbCashSession, 'expectedCash' | 'countedCash' | 'difference' | 'closingDenominations' | 'closedBy' | 'closedAt'>): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('close_cash_session', { p_session_id: sessionId, p_close: close });
    if (error) throw error;
    return Boolean(data);
  }

  async closeCashSessionWithClosing(sessionId: string, close: Pick<DbCashSession, 'expectedCash' | 'countedCash' | 'difference' | 'closingDenominations' | 'closedBy' | 'closedAt'>, closure: DbDailyClosure): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('close_cash_session_with_closing', { p_session_id: sessionId, p_close: close, p_closure: closure });
    if (error) throw error;
    return Boolean(data);
  }

  async getProductionBatches(): Promise<DbProductionBatch[]> {
    const { data, error } = await this.supabase.from('production_batches').select('*').order('produced_at', { ascending: false });
    if (error) throw error;
    return data.map((row: Record<string, unknown>) => ({
      id: String(row.id), productId: String(row.product_id), quantityProduced: Number(row.quantity_produced),
      totalCost: Number(row.total_cost), wasteQuantity: Number(row.waste_quantity), expiresAt: row.expires_at ? String(row.expires_at) : undefined,
      responsibleUserId: String(row.responsible_user_id), operationId: String(row.operation_id), producedAt: String(row.produced_at),
      consumption: (row.consumption || []) as DbInventoryConsumption[],
    }));
  }

  async recordProductionBatch(batch: DbProductionBatch): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('record_production_batch', { p_batch: batch });
    if (error) throw error;
    return Boolean(data);
  }

}

function mapCashSession(row: Record<string, unknown>): DbCashSession {
  return {
    id: String(row.id), openingAmount: Number(row.opening_amount), openingDenominations: (row.opening_denominations || {}) as Record<string, number>,
    openedBy: String(row.opened_by), openedAt: String(row.opened_at), expectedCash: row.expected_cash == null ? undefined : Number(row.expected_cash),
    countedCash: row.counted_cash == null ? undefined : Number(row.counted_cash), difference: row.difference == null ? undefined : Number(row.difference),
    closingDenominations: row.closing_denominations as Record<string, number> | undefined, closedBy: row.closed_by ? String(row.closed_by) : undefined,
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
  };
}

// Supabase's dynamic schema returns untyped rows; conversion stays at this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrder(row: Record<string, any>): DbOrder { return {
      id: row.id,
      folio: row.folio || row.id,
      operationId: row.operation_id || undefined,
      deviceId: row.device_id || undefined,
      channel: row.channel || 'POS',
      paymentProvider: row.payment_provider || undefined,
      pickup: row.pickup || undefined,
      baristaId: row.barista_id || undefined,
      customerName: row.customer_name,
      items: row.items, // already jsonb
      subtotal: row.subtotal == null ? Number(row.total) : Number(row.subtotal),
      discount: row.discount == null ? 0 : Number(row.discount),
      discountType: row.discount_type || undefined,
      discountReason: row.discount_reason || undefined,
      discountAuthorizedBy: row.discount_authorized_by || undefined,
      tax: row.tax == null ? 0 : Number(row.tax),
      total: Number(row.total),
      status: row.status,
      paymentStatus: row.payment_status || undefined,
      paymentMethod: row.payment_method,
      paymentId: row.payment_id || undefined,
      paymentIntentId: row.payment_intent_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
      notes: row.notes || undefined,
      cancellationReason: row.cancellation_reason || undefined,
      inventoryAppliedAt: row.inventory_applied_at || undefined,
    }; }
