import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DbAdapter, DbInventoryItem, DbCashRegister, DbCashTransaction, DbBakeryBatch, DbOrder } from './db';

export class SupabaseDbAdapter implements DbAdapter {
  private supabase: SupabaseClient;

  constructor(url: string, key: string) {
    this.supabase = createClient(url, key);
  }

  async initialize(): Promise<void> {
    // Initialization/Migrations are handled manually via SQL script in Supabase
    console.log('SupabaseDbAdapter: Initialize check (ping)...');
    const { error } = await this.supabase.from('inventory').select('product_id').limit(1);
    if (error) {
      console.warn('Supabase initialization check failed. Ensure tables are created:', error.message);
    } else {
      console.log('Supabase connection successful.');
    }
  }

  async getOrders(): Promise<DbOrder[]> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data.map((row: any) => ({
      id: row.id,
      customerName: row.customer_name,
      items: row.items, // already jsonb
      total: Number(row.total),
      status: row.status,
      paymentMethod: row.payment_method,
      paymentId: row.payment_id || undefined,
      paymentIntentId: row.payment_intent_id || undefined,
      createdAt: row.created_at,
    }));
  }

  async createOrder(order: DbOrder): Promise<void> {
    const { error } = await this.supabase.from('orders').insert({
      id: order.id,
      customer_name: order.customerName,
      items: order.items,
      total: order.total,
      status: order.status,
      payment_method: order.paymentMethod,
      payment_id: order.paymentId || null,
      payment_intent_id: order.paymentIntentId || null,
      created_at: new Date(order.createdAt).toISOString()
    });

    if (error) throw error;

    // Decrement stock in database
    for (const item of order.items) {
      // Need to read current stock, then update.
      // Better way is a stored procedure, but for simplicity we fetch and update.
      const { data: inv } = await this.supabase.from('inventory').select('stock').eq('product_id', item.product.id).single();
      if (inv) {
        await this.supabase.from('inventory').update({ stock: Math.max(0, inv.stock - item.quantity) }).eq('product_id', item.product.id);
      }
    }
  }

  async updateOrderStatus(orderId: string, status: string, paymentId?: string): Promise<void> {
    const payload: any = { status };
    if (paymentId) payload.payment_id = paymentId;

    const { error } = await this.supabase.from('orders').update(payload).eq('id', orderId);
    if (error) throw error;
  }

  async clearOrders(): Promise<void> {
    const { error } = await this.supabase.from('orders').delete().neq('id', 'placeholder_for_all'); 
    // Supabase needs a filter to delete all, .neq is a hack to match everything
    if (error) throw error;
  }

  async getInventory(): Promise<DbInventoryItem[]> {
    const { data, error } = await this.supabase.from('inventory').select('*');
    if (error) throw error;

    return data.map((row: any) => ({
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

  async getCashRegister(): Promise<Record<string, number>> {
    const { data, error } = await this.supabase.from('cash_register').select('*');
    if (error) throw error;

    const reg: Record<string, number> = {};
    data.forEach((row: any) => {
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

  async addCashTransaction(transaction: DbCashTransaction): Promise<void> {
    const { error } = await this.supabase.from('cash_transactions').insert({
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      denominations: transaction.denominations,
    });
    if (error) throw error;

    // Update register counts
    const multiplier = (transaction.type === 'change' || transaction.type === 'manual_expense' || transaction.type === 'manual_investment') ? -1 : 1;
    for (const [denom, count] of Object.entries(transaction.denominations)) {
      const { data: reg } = await this.supabase.from('cash_register').select('count').eq('denomination', denom).single();
      if (reg) {
        await this.supabase.from('cash_register').update({ count: Math.max(0, reg.count + (count * multiplier)) }).eq('denomination', denom);
      } else {
        await this.supabase.from('cash_register').insert({ denomination: denom, count: Math.max(0, count * multiplier) });
      }
    }
  }

  async getTransactionLedger(): Promise<DbCashTransaction[]> {
    const { data, error } = await this.supabase.from('cash_transactions').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    return data.map((row: any) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      description: row.description,
      denominations: row.denominations,
      created_at: row.created_at,
      status: row.status,
      audit_reason: row.audit_reason,
      original_amount: row.original_amount ? Number(row.original_amount) : undefined,
    }));
  }

  async updateCashTransaction(id: number, status: 'deleted' | 'modified', auditReason: string, newAmount?: number): Promise<void> {
    const payload: any = { status, audit_reason: auditReason };
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

    return data.map((row: any) => ({
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
}
