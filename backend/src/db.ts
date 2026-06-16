import type { Client } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DbRawInventory {
  id: string; // e.g., 'coffee_beans', 'milk_whole'
  name: string;
  unit: string; // e.g., 'g', 'ml', 'un'
  stock: number;
  cost: number; // cost per unit or total cost. Let's say cost is total cost for current stock to calculate unit cost: cost / stock.
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
  recipe?: Record<string, number>; // e.g., { "coffee_beans": 25, "milk_whole": 280 }
}

// Define DB structures
export interface DbInventoryItem {
  product_id: string;
  stock: number;
  cost: number;
}

export interface DbCashRegister {
  denomination: string;
  count: number;
}

export interface DbCashTransaction {
  id?: number;
  type: 'payment' | 'change' | 'manual_income' | 'manual_expense' | 'adjustment' | 'manual_investment' | 'card_payment';
  amount: number;
  description: string;
  denominations: Record<string, number>;
  created_at?: string;
  status?: 'active' | 'deleted' | 'modified';
  audit_reason?: string;
  original_amount?: number;
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
}

import { SupabaseDbAdapter } from './supabaseAdapter';

// Order structures match our existing types
export interface DbOrder {
  id: string;
  customerName: string;
  items: any[];
  total: number;
  status: string;
  paymentMethod: 'card' | 'cash';
  paymentId?: string;
  paymentIntentId?: string;
  createdAt: string;
}

// Adaptor interface
export interface DbAdapter {
  initialize(): Promise<void>;
  getOrders(): Promise<DbOrder[]>;
  createOrder(order: DbOrder): Promise<void>;
  updateOrderStatus(orderId: string, status: string, paymentId?: string): Promise<void>;
  clearOrders(): Promise<void>;
  getInventory(): Promise<DbInventoryItem[]>;
  updateInventory(productId: string, stock: number, cost: number): Promise<void>;
  
  getRawInventory(): Promise<DbRawInventory[]>;
  updateRawInventory(id: string, stock: number, cost: number): Promise<void>;
  createRawInventoryItem(item: DbRawInventory): Promise<void>;
  getProducts(): Promise<DbProduct[]>;
  updateProductPrice(id: string, price: number): Promise<void>;
  updateProductRecipe(productId: string, recipe: Record<string, number>): Promise<void>;
  getCashRegister(): Promise<Record<string, number>>;
  adjustCashRegister(denominations: Record<string, number>): Promise<void>;
  addCashTransaction(transaction: DbCashTransaction): Promise<void>;
  getTransactionLedger(): Promise<DbCashTransaction[]>;
  updateCashTransaction(id: number, status: 'deleted' | 'modified', auditReason: string, newAmount?: number): Promise<void>;
  getBakeryBatches(): Promise<DbBakeryBatch[]>;
  addBakeryBatch(batch: DbBakeryBatch): Promise<void>;
  getDailyClosures(): Promise<DbDailyClosure[]>;
  createDailyClosure(closure: DbDailyClosure): Promise<void>;
}

// 1. JSON Local File Database Adapter (for local development / offline fallback)
class JsonDbAdapter implements DbAdapter {
  private filePath = path.join(__dirname, '..', 'db.json');
  private data: {
    orders: DbOrder[];
    inventory: DbInventoryItem[];
    cashRegister: Record<string, number>;
    transactions: DbCashTransaction[];
    bakeryBatches: DbBakeryBatch[];
    dailyClosures: DbDailyClosure[];
  } = {
    orders: [],
    inventory: [],
    cashRegister: {},
    transactions: [],
    bakeryBatches: [],
    dailyClosures: []
  };

  private async read() {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      this.data = JSON.parse(content);
    } catch (e) {
      // If file doesn't exist, keep default and save it
      await this.save();
    }
  }

  private async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
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

    await this.save();
  }

  async getOrders(): Promise<DbOrder[]> {
    await this.read();
    return this.data.orders || [];
  }

  async createOrder(order: DbOrder): Promise<void> {
    await this.read();
    if (!this.data.orders) this.data.orders = [];
    this.data.orders.push(order);

    // Decrement stock in inventory
    if (this.data.inventory) {
      order.items.forEach((item: any) => {
        const invItem = this.data.inventory.find(i => i.product_id === item.product.id);
        if (invItem) {
          invItem.stock = Math.max(0, invItem.stock - item.quantity);
        }
      });
    }

    await this.save();
  }

  async updateOrderStatus(orderId: string, status: string, paymentId?: string): Promise<void> {
    await this.read();
    const order = this.data.orders.find(o => o.id === orderId);
    if (order) {
      order.status = status;
      if (paymentId) {
        order.paymentId = paymentId;
      }
      await this.save();
    }
  }

  async clearOrders(): Promise<void> {
    await this.read();
    this.data.orders = [];
    await this.save();
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

  async getRawInventory(): Promise<import('./db').DbRawInventory[]> { return []; }
  async updateRawInventory(id: string, stock: number, cost: number): Promise<void> {}
  async createRawInventoryItem(item: import('./db').DbRawInventory): Promise<void> {}
  async getProducts(): Promise<import('./db').DbProduct[]> { return []; }
  async updateProductPrice(id: string, price: number): Promise<void> {}
  async updateProductRecipe(productId: string, recipe: Record<string, number>): Promise<void> {}

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

  async addCashTransaction(transaction: DbCashTransaction): Promise<void> {
    await this.read();
    if (!this.data.transactions) this.data.transactions = [];
    
    const newTx = {
      ...transaction,
      id: this.data.transactions.length + 1,
      created_at: new Date().toISOString()
    };
    this.data.transactions.push(newTx);

    // Update cash register counts
    if (this.data.cashRegister) {
      Object.entries(transaction.denominations).forEach(([denom, count]) => {
        // If type is change, manual_expense, or manual_investment, we subtract. Otherwise we add
        const multiplier = (transaction.type === 'change' || transaction.type === 'manual_expense' || transaction.type === 'manual_investment') ? -1 : 1;
        this.data.cashRegister[denom] = Math.max(0, (this.data.cashRegister[denom] || 0) + (count * multiplier));
      });
    }

    await this.save();
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
}

// 2. PostgreSQL Cloud Database Adapter (for Render production)
class PostgresDbAdapter implements DbAdapter {
  private client: Client;

  constructor(connectionString: string) {
    const { Client: PgClient } = require('pg');
    this.client = new PgClient({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  async initialize() {
    await this.client.connect();

    // Create tables
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        product_id VARCHAR(100) PRIMARY KEY,
        stock INT NOT NULL DEFAULT 0,
        cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00
      );
    `);

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        customer_name VARCHAR(100) NOT NULL,
        items TEXT NOT NULL,
        total NUMERIC(10, 2) NOT NULL,
        status VARCHAR(50) NOT NULL,
        payment_method VARCHAR(20) NOT NULL,
        payment_id VARCHAR(100),
        payment_intent_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS cash_register (
        denomination VARCHAR(50) PRIMARY KEY,
        count INT NOT NULL DEFAULT 0
      );
    `);

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS cash_transactions (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        description TEXT,
        denominations TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        audit_reason TEXT,
        original_amount NUMERIC(10, 2)
      );
    `);

    // Add columns dynamically in case table already existed before without them
    await this.client.query(`
      ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS audit_reason TEXT;
      ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10, 2);
    `);

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS bakery_batches (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(100) NOT NULL,
        quantity INT NOT NULL,
        added_at TIMESTAMP NOT NULL,
        expires_at TIMESTAMP NOT NULL
      );
    `);

    // Populate default inventory if empty
    const invCheck = await this.client.query('SELECT COUNT(*) FROM inventory');
    if (parseInt(invCheck.rows[0].count, 10) === 0) {
      const defaultInventory = [
        ['espresso', 50, 8.00],
        ['double-espresso', 50, 12.00],
        ['americano', 50, 6.00],
        ['latte', 50, 14.00],
        ['flat-white', 50, 16.00],
        ['matcha-latte', 30, 20.00],
        ['cold-brew', 40, 10.00],
        ['iced-latte', 40, 14.00],
        ['iced-matcha-latte', 30, 20.00],
        ['croissant-mantequilla', 15, 15.00],
        ['pain-au-chocolat', 15, 18.00],
        ['galleta-chocolate', 20, 8.00]
      ];
      for (const [id, stock, cost] of defaultInventory) {
        await this.client.query(
          'INSERT INTO inventory (product_id, stock, cost) VALUES ($1, $2, $3)',
          [id, stock, cost]
        );
      }
    }

    // Populate default cash register if empty
    const cashCheck = await this.client.query('SELECT COUNT(*) FROM cash_register');
    if (parseInt(cashCheck.rows[0].count, 10) === 0) {
      const denoms = [
        'bill_1000', 'bill_500', 'bill_200', 'bill_100', 'bill_50', 'bill_20',
        'coin_20', 'coin_10', 'coin_5', 'coin_2', 'coin_1', 'coin_0_50', 'coin_0_20'
      ];
      for (const d of denoms) {
        await this.client.query(
          'INSERT INTO cash_register (denomination, count) VALUES ($1, 0)',
          [d]
        );
      }
    }
  }

  async getOrders(): Promise<DbOrder[]> {
    const res = await this.client.query('SELECT * FROM orders ORDER BY created_at ASC');
    return res.rows.map(row => ({
      id: row.id,
      customerName: row.customer_name,
      items: JSON.parse(row.items),
      total: parseFloat(row.total),
      status: row.status,
      paymentMethod: row.payment_method,
      paymentId: row.payment_id || undefined,
      paymentIntentId: row.payment_intent_id || undefined,
      createdAt: row.created_at.toISOString()
    }));
  }

  async createOrder(order: DbOrder): Promise<void> {
    await this.client.query(
      `INSERT INTO orders (id, customer_name, items, total, status, payment_method, payment_id, payment_intent_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        order.id,
        order.customerName,
        JSON.stringify(order.items),
        order.total,
        order.status,
        order.paymentMethod,
        order.paymentId || null,
        order.paymentIntentId || null,
        new Date(order.createdAt)
      ]
    );

    // Decrement stock in database
    for (const item of order.items) {
      await this.client.query(
        'UPDATE inventory SET stock = GREATEST(0, stock - $1) WHERE product_id = $2',
        [item.quantity, item.product.id]
      );
    }
  }

  async updateOrderStatus(orderId: string, status: string, paymentId?: string): Promise<void> {
    if (paymentId) {
      await this.client.query(
        'UPDATE orders SET status = $1, payment_id = $2 WHERE id = $3',
        [status, paymentId, orderId]
      );
    } else {
      await this.client.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [status, orderId]
      );
    }
  }

  async clearOrders(): Promise<void> {
    await this.client.query('DELETE FROM orders');
  }

  async getInventory(): Promise<DbInventoryItem[]> {
    const res = await this.client.query('SELECT * FROM inventory');
    return res.rows.map(row => ({
      product_id: row.product_id,
      stock: parseInt(row.stock, 10),
      cost: parseFloat(row.cost)
    }));
  }

  async updateInventory(productId: string, stock: number, cost: number): Promise<void> {
    await this.client.query(
      `INSERT INTO inventory (product_id, stock, cost)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id)
       DO UPDATE SET stock = EXCLUDED.stock, cost = EXCLUDED.cost`,
      [productId, stock, cost]
    );
  }

  async getRawInventory(): Promise<import('./db').DbRawInventory[]> {
    return [];
  }
  async updateRawInventory(id: string, stock: number, cost: number): Promise<void> {}
  async createRawInventoryItem(item: import('./db').DbRawInventory): Promise<void> {}
  async getProducts(): Promise<import('./db').DbProduct[]> {
    return [];
  }
  async updateProductPrice(id: string, price: number): Promise<void> {}
  async updateProductRecipe(productId: string, recipe: Record<string, number>): Promise<void> {}

  async getCashRegister(): Promise<Record<string, number>> {
    const res = await this.client.query('SELECT * FROM cash_register');
    const reg: Record<string, number> = {};
    res.rows.forEach(row => {
      reg[row.denomination] = parseInt(row.count, 10);
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
      await this.client.query(
        `INSERT INTO cash_register (denomination, count)
         VALUES ($1, $2)
         ON CONFLICT (denomination)
         DO UPDATE SET count = EXCLUDED.count`,
        [denom, count]
      );
      totalAdjusted += count * (values[denom] || 0);
    }

    // Add transaction log
    await this.client.query(
      `INSERT INTO cash_transactions (type, amount, description, denominations)
       VALUES ($1, $2, $3, $4)`,
      ['adjustment', totalAdjusted, 'Ajuste manual del administrador', JSON.stringify(denominations)]
    );
  }

  async addCashTransaction(transaction: DbCashTransaction): Promise<void> {
    await this.client.query(
      `INSERT INTO cash_transactions (type, amount, description, denominations)
       VALUES ($1, $2, $3, $4)`,
      [
        transaction.type,
        transaction.amount,
        transaction.description,
        JSON.stringify(transaction.denominations)
      ]
    );

    // Update register counts
    const multiplier = (transaction.type === 'change' || transaction.type === 'manual_expense' || transaction.type === 'manual_investment') ? -1 : 1;
    for (const [denom, count] of Object.entries(transaction.denominations)) {
      await this.client.query(
        `INSERT INTO cash_register (denomination, count)
         VALUES ($1, $2)
         ON CONFLICT (denomination)
         DO UPDATE SET count = GREATEST(0, cash_register.count + ($2 * ${multiplier}))`,
        [denom, count]
      );
    }
  }

  async getTransactionLedger(): Promise<DbCashTransaction[]> {
    const res = await this.client.query('SELECT * FROM cash_transactions ORDER BY created_at DESC');
    return res.rows.map(row => ({
      id: row.id,
      type: row.type,
      amount: parseFloat(row.amount),
      description: row.description,
      denominations: JSON.parse(row.denominations),
      created_at: row.created_at.toISOString(),
      status: row.status,
      audit_reason: row.audit_reason,
      original_amount: row.original_amount ? parseFloat(row.original_amount) : undefined
    }));
  }

  async updateCashTransaction(id: number, status: 'deleted' | 'modified', auditReason: string, newAmount?: number): Promise<void> {
    if (status === 'modified' && newAmount !== undefined) {
      await this.client.query(
        'UPDATE cash_transactions SET status = $1, audit_reason = $2, original_amount = amount, amount = $3 WHERE id = $4',
        [status, auditReason, newAmount, id]
      );
    } else {
      await this.client.query(
        'UPDATE cash_transactions SET status = $1, audit_reason = $2 WHERE id = $3',
        [status, auditReason, id]
      );
    }
  }

  async getBakeryBatches(): Promise<DbBakeryBatch[]> {
    const res = await this.client.query('SELECT * FROM bakery_batches ORDER BY added_at ASC');
    return res.rows.map(row => ({
      id: row.id,
      product_id: row.product_id,
      quantity: parseInt(row.quantity, 10),
      added_at: row.added_at.toISOString(),
      expires_at: row.expires_at.toISOString()
    }));
  }

  async addBakeryBatch(batch: DbBakeryBatch): Promise<void> {
    await this.client.query(
      `INSERT INTO bakery_batches (product_id, quantity, added_at, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [
        batch.product_id,
        batch.quantity,
        new Date(batch.added_at),
        new Date(batch.expires_at)
      ]
    );
  }
}

// Export singleton instance based on environment variables
const connectionString = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

export const db: DbAdapter = (supabaseUrl && supabaseKey) 
  ? new SupabaseDbAdapter(supabaseUrl, supabaseKey) 
  : (connectionString ? new PostgresDbAdapter(connectionString) : new JsonDbAdapter());
