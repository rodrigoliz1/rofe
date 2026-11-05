import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
let JsonDbAdapter: typeof import('../src/db').JsonDbAdapter;
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(40);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
  ({ JsonDbAdapter } = await import('../src/db'));
});
let directory: string;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
describe('local adapter concurrent reads and writes', () => {
  it('does not lose an order when status polls overlap a write', async () => {
    directory = await mkdtemp(join(tmpdir(), 'rofe-concurrency-'));
    const file = join(directory, 'db.json');
    const database = new JsonDbAdapter(file);
    await database.initialize();
    const operations = Array.from({ length: 30 }, async () => {
      const id = randomUUID();
      await Promise.all([
        database.createOrder({ id, operationId: id, items: [], customerName: 'Concurrency test', total: 10, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', paymentMethod: 'card', createdAt: new Date().toISOString() }),
        database.getOrders(), database.getProducts(), database.getRawInventory(),
      ]);
      expect(await database.getOrderById(id)).toBeDefined();
    });
    await Promise.all(operations);
    expect(await database.getOrders()).toHaveLength(30);
    expect(JSON.parse(await readFile(file, 'utf8')).orders).toHaveLength(30);
  });
});
