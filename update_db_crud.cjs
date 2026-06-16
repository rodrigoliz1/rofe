const fs = require('fs');

const backendDb = 'backend/src/db.ts';
let bContent = fs.readFileSync(backendDb, 'utf8');

// 1. Add to DbAdapter interface
const dbAdapterTarget = `  getProducts(): Promise<DbProduct[]>;`;
const dbAdapterRep = `  getProducts(): Promise<DbProduct[]>;
  createProduct(product: DbProduct): Promise<void>;
  updateProduct(id: string, product: Partial<DbProduct>): Promise<void>;
  deleteProduct(id: string): Promise<void>;`;
bContent = bContent.replace(dbAdapterTarget, dbAdapterRep);

// 2. Add to JsonDbAdapter
const jsonAdapterTarget = `  async getProducts(): Promise<DbProduct[]> {
    await this.read();
    return this.data.products || [];
  }`;
const jsonAdapterRep = `  async getProducts(): Promise<DbProduct[]> {
    await this.read();
    return this.data.products || [];
  }

  async createProduct(product: DbProduct): Promise<void> {
    await this.read();
    if (!this.data.products) this.data.products = [];
    this.data.products.push(product);
    await this.save();
  }

  async updateProduct(id: string, updates: Partial<DbProduct>): Promise<void> {
    await this.read();
    if (!this.data.products) return;
    const index = this.data.products.findIndex(p => p.id === id);
    if (index !== -1) {
      this.data.products[index] = { ...this.data.products[index], ...updates };
      await this.save();
    }
  }

  async deleteProduct(id: string): Promise<void> {
    await this.read();
    if (!this.data.products) return;
    this.data.products = this.data.products.filter(p => p.id !== id);
    await this.save();
  }`;
bContent = bContent.replace(jsonAdapterTarget, jsonAdapterRep);

// 3. Add to PostgresDbAdapter
const pgAdapterTarget = `  async getProducts(): Promise<DbProduct[]> {
    const res = await this.client.query('SELECT * FROM products ORDER BY name ASC');
    return res.rows.map(row => ({
      ...row,
      recipe: typeof row.recipe === 'string' ? JSON.parse(row.recipe) : row.recipe
    }));
  }`;
const pgAdapterRep = `  async getProducts(): Promise<DbProduct[]> {
    const res = await this.client.query('SELECT * FROM products ORDER BY name ASC');
    return res.rows.map(row => ({
      ...row,
      recipe: typeof row.recipe === 'string' ? JSON.parse(row.recipe) : row.recipe,
      custom_variants: typeof row.custom_variants === 'string' ? JSON.parse(row.custom_variants) : row.custom_variants
    }));
  }

  async createProduct(product: DbProduct): Promise<void> {
    await this.client.query(
      \`INSERT INTO products (id, name, description, price, category, icon, customizable, image, recipe, custom_variants)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)\`,
      [
        product.id, product.name, product.description, product.price, product.category,
        product.icon, product.customizable, product.image,
        product.recipe ? JSON.stringify(product.recipe) : null,
        product.custom_variants ? JSON.stringify(product.custom_variants) : null
      ]
    );
  }

  async updateProduct(id: string, product: Partial<DbProduct>): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(product)) {
      if (key === 'id') continue;
      updates.push(\`\${key} = $\${idx}\`);
      values.push((key === 'recipe' || key === 'custom_variants') && val ? JSON.stringify(val) : val);
      idx++;
    }
    if (updates.length === 0) return;
    values.push(id);
    await this.client.query(
      \`UPDATE products SET \${updates.join(', ')} WHERE id = $\${idx}\`,
      values
    );
  }

  async deleteProduct(id: string): Promise<void> {
    await this.client.query('DELETE FROM products WHERE id = $1', [id]);
  }`;
bContent = bContent.replace(pgAdapterTarget, pgAdapterRep);

fs.writeFileSync(backendDb, bContent);

// 4. Add to SupabaseDbAdapter
const supabaseDb = 'backend/src/supabaseAdapter.ts';
let sContent = fs.readFileSync(supabaseDb, 'utf8');

const sAdapterTarget = `  async getProducts(): Promise<DbProduct[]> {
    const { data, error } = await this.supabase.from('products').select('*').order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }`;
const sAdapterRep = `  async getProducts(): Promise<DbProduct[]> {
    const { data, error } = await this.supabase.from('products').select('*').order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createProduct(product: DbProduct): Promise<void> {
    const { error } = await this.supabase.from('products').insert(product);
    if (error) throw error;
  }

  async updateProduct(id: string, product: Partial<DbProduct>): Promise<void> {
    const { error } = await this.supabase.from('products').update(product).eq('id', id);
    if (error) throw error;
  }

  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  }`;

sContent = sContent.replace(sAdapterTarget, sAdapterRep);
fs.writeFileSync(supabaseDb, sContent);

