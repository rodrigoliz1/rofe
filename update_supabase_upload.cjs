const fs = require('fs');

const file = 'backend/src/supabaseAdapter.ts';
let content = fs.readFileSync(file, 'utf8');

const sAdapterTarget = `  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  }`;

const sAdapterRep = `  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  }

  async uploadProductImage(fileName: string, buffer: Buffer, mimeType: string): Promise<string> {
    const path = \`\${Date.now()}_\${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}\`;
    const { data, error } = await this.supabase.storage
      .from('product_images')
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    
    if (error) throw error;

    const { data: publicData } = this.supabase.storage
      .from('product_images')
      .getPublicUrl(path);
      
    return publicData.publicUrl;
  }`;

content = content.replace(sAdapterTarget, sAdapterRep);
fs.writeFileSync(file, content);

// Add empty implementations to PostgresDbAdapter and JsonDbAdapter
const dbFile = 'backend/src/db.ts';
let dbContent = fs.readFileSync(dbFile, 'utf8');

const jsonAdapterTarget = `  async deleteProduct(id: string): Promise<void> {
    await this.read();
    if (!this.data.products) return;
    this.data.products = this.data.products.filter(p => p.id !== id);
    await this.save();
  }`;

const jsonAdapterRep = `  async deleteProduct(id: string): Promise<void> {
    await this.read();
    if (!this.data.products) return;
    this.data.products = this.data.products.filter(p => p.id !== id);
    await this.save();
  }

  async uploadProductImage(fileName: string, buffer: Buffer, mimeType: string): Promise<string> {
    // Mock implementation for local testing without supabase
    return \`https://via.placeholder.com/150?text=\${encodeURIComponent(fileName)}\`;
  }`;

dbContent = dbContent.replace(jsonAdapterTarget, jsonAdapterRep);

const pgAdapterTarget = `  async deleteProduct(id: string): Promise<void> {
    await this.client.query('DELETE FROM products WHERE id = $1', [id]);
  }`;

const pgAdapterRep = `  async deleteProduct(id: string): Promise<void> {
    await this.client.query('DELETE FROM products WHERE id = $1', [id]);
  }

  async uploadProductImage(fileName: string, buffer: Buffer, mimeType: string): Promise<string> {
    // PostgreSQL direct bytea storage could be implemented here, but we are using Supabase Storage
    throw new Error('uploadProductImage not implemented in PostgresDbAdapter without Supabase');
  }`;

dbContent = dbContent.replace(pgAdapterTarget, pgAdapterRep);

fs.writeFileSync(dbFile, dbContent);
