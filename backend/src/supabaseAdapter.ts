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

    // Decrement stock in database using recipes and raw_inventory
    const { data: products } = await this.supabase.from('products').select('*');
    const { data: rawInv } = await this.supabase.from('raw_inventory').select('*');

    if (products && rawInv) {
      const deductions: Record<string, number> = {};

      for (const item of order.items) {
        const p = products.find((prod: any) => prod.id === item.product.id);
        if (!p) continue;
        
        let recipe = p.recipe || {};
        
        // Handle customizations modifying the recipe
        if (item.customization) {
          // Base recipe modifications depending on size, etc.
          let multiplier = item.customization.size === 'grande' ? 1.5 : 1;
          
          const dynamicRecipe: Record<string, number> = { ...recipe };
          
          if (dynamicRecipe['coffee_beans']) {
            dynamicRecipe['coffee_beans'] *= multiplier;
          }
          if (dynamicRecipe['matcha_powder']) {
            dynamicRecipe['matcha_powder'] *= multiplier;
          }
          
          if (dynamicRecipe['milk_whole'] && item.customization.milk !== 'whole') {
             const amount = dynamicRecipe['milk_whole'] * multiplier;
             delete dynamicRecipe['milk_whole'];
             if (item.customization.milk === 'light') dynamicRecipe['milk_light'] = amount;
             if (item.customization.milk === 'avena') dynamicRecipe['milk_avena'] = amount;
             if (item.customization.milk === 'almendra') dynamicRecipe['milk_almendra'] = amount;
          } else if (dynamicRecipe['milk_whole']) {
             dynamicRecipe['milk_whole'] *= multiplier;
          }
          
          if (item.customization.extraShot) {
             dynamicRecipe['coffee_beans'] = (dynamicRecipe['coffee_beans'] || 0) + 25; // add 25g
          }
          
          // Cups
          if (p.category === 'coffee' || p.category === 'cold') {
             const isCold = p.category === 'cold' || item.customization.temp === 'iced';
             const cupKey = isCold 
                ? (item.customization.size === 'grande' ? 'cup_cold_16oz' : 'cup_cold_12oz')
                : (item.customization.size === 'grande' ? 'cup_hot_12oz' : 'cup_hot_8oz');
             dynamicRecipe[cupKey] = 1;
             
             dynamicRecipe[isCold ? 'lid_cold' : 'lid_hot'] = 1;
             if (isCold) dynamicRecipe['straw'] = 1;
             if (!isCold) dynamicRecipe['sleeve'] = 1;
          }
          
          if (item.customization.sweetness !== 'none') {
             dynamicRecipe['splenda'] = item.customization.sweetness === 'extra' ? 2 : 1;
          }

          // Multiply by item quantity
          for (const [ing, qty] of Object.entries(dynamicRecipe)) {
             deductions[ing] = (deductions[ing] || 0) + (Number(qty) * item.quantity);
          }
        } else {
          // No customizations (e.g. Bakery)
          for (const [ing, qty] of Object.entries(recipe)) {
             deductions[ing] = (deductions[ing] || 0) + (Number(qty) * item.quantity);
          }
        }
      }

      // Now apply deductions to raw_inventory
      for (const [ing, qty] of Object.entries(deductions)) {
         const current = rawInv.find((r: any) => r.id === ing);
         if (current) {
            await this.supabase.from('raw_inventory').update({ stock: Math.max(0, current.stock - qty) }).eq('id', ing);
         }
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

  async getRawInventory(): Promise<import('./db').DbRawInventory[]> {
    const { data, error } = await this.supabase.from('raw_inventory').select('*');
    if (error) throw error;
    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      stock: Number(row.stock),
      cost: Number(row.cost),
    }));
  }

  async updateRawInventory(id: string, stock: number, cost: number): Promise<void> {
    const { error } = await this.supabase.from('raw_inventory').update({ stock, cost }).eq('id', id);
    if (error) throw error;
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
    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      category: row.category,
      icon: row.icon,
      customizable: row.customizable,
      image: row.image,
      recipe: row.recipe,
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
    const { data, error } = await this.supabase.storage
      .from('product_images')
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    
    if (error) throw error;

    const { data: publicData } = this.supabase.storage
      .from('product_images')
      .getPublicUrl(path);
      
    return publicData.publicUrl;
  }

}