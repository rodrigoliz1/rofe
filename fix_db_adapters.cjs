const fs = require('fs');

const backendDb = 'backend/src/db.ts';
let bContent = fs.readFileSync(backendDb, 'utf8');

// JsonDbAdapter
const jsonTarget = `  async getProducts(): Promise<import('./db').DbProduct[]> { return []; }`;
const jsonRep = `  async getProducts(): Promise<DbProduct[]> { return []; }
  async createProduct(product: DbProduct): Promise<void> {}
  async updateProduct(id: string, product: Partial<DbProduct>): Promise<void> {}
  async deleteProduct(id: string): Promise<void> {}
  async uploadProductImage(f: string, b: Buffer, m: string): Promise<string> { return ''; }`;
bContent = bContent.replace(jsonTarget, jsonRep);

// PostgresDbAdapter
const pgTarget = `  async getProducts(): Promise<import('./db').DbProduct[]> {
    return [];
  }`;
const pgRep = `  async getProducts(): Promise<DbProduct[]> { return []; }
  async createProduct(product: DbProduct): Promise<void> {}
  async updateProduct(id: string, product: Partial<DbProduct>): Promise<void> {}
  async deleteProduct(id: string): Promise<void> {}
  async uploadProductImage(f: string, b: Buffer, m: string): Promise<string> { return ''; }`;
bContent = bContent.replace(pgTarget, pgRep);

fs.writeFileSync(backendDb, bContent);
