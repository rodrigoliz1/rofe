const fs = require('fs');
const file = 'backend/src/supabaseAdapter.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `  async getProducts(): Promise<import('./db').DbProduct[]> {
    const { data, error } = await this.supabase.from('products').select('*');`;

const rep = `  async getProducts(): Promise<import('./db').DbProduct[]> {
    const { data, error } = await this.supabase.from('products').select('*');`;

// Let's just append the missing methods to the end of the class before the last closing brace
const classEndIndex = content.lastIndexOf('}');

const methodsToAdd = `
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
    const path = \`\${Date.now()}_\${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}\`;
    const { data, error } = await this.supabase.storage
      .from('product_images')
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    
    if (error) throw error;

    const { data: publicData } = this.supabase.storage
      .from('product_images')
      .getPublicUrl(path);
      
    return publicData.publicUrl;
  }
`;

content = content.slice(0, classEndIndex) + methodsToAdd + '\n}';
fs.writeFileSync(file, content);
