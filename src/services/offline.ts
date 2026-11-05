import { openDB, type DBSchema } from 'idb';
import type { Product } from '../types';

export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface OutboxOperation {
  operationId: string;
  deviceId: string;
  type: 'CREATE_CASH_ORDER';
  payload: unknown;
  createdAt: string;
  syncStatus: SyncStatus;
  retryCount: number;
  lastError?: string;
}

interface RofeDatabase extends DBSchema {
  outbox: {
    key: string;
    value: OutboxOperation;
    indexes: { by_status: SyncStatus };
  };
  catalog: { key: string; value: { key: string; products: Product[]; savedAt: string } };
  device: {
    key: string;
    value: { key: string; deviceId: string; deviceToken: string; name: string };
  };
}

const databasePromise = openDB<RofeDatabase>('rofe-pos', 2, {
  upgrade(database) {
    if (!database.objectStoreNames.contains('outbox')) {
      const outbox = database.createObjectStore('outbox', { keyPath: 'operationId' });
      outbox.createIndex('by_status', 'syncStatus');
    }
    if (!database.objectStoreNames.contains('device')) database.createObjectStore('device', { keyPath: 'key' });
    if (!database.objectStoreNames.contains('catalog')) database.createObjectStore('catalog', { keyPath: 'key' });
  },
});

export async function saveDeviceCredentials(input: { deviceId: string; deviceToken: string; name: string }): Promise<void> {
  const database = await databasePromise;
  await database.put('device', { key: 'current', ...input });
}

export async function getDeviceCredentials() {
  const database = await databasePromise;
  return database.get('device', 'current');
}

export async function enqueueCashOrder(operation: Omit<OutboxOperation, 'createdAt' | 'syncStatus' | 'retryCount'>): Promise<void> {
  const database = await databasePromise;
  await database.put('outbox', { ...operation, createdAt: new Date().toISOString(), syncStatus: 'PENDING', retryCount: 0 });
}

export async function getPendingOperations(): Promise<OutboxOperation[]> {
  const database = await databasePromise;
  const pending = await database.getAllFromIndex('outbox', 'by_status', 'PENDING');
  const interrupted = await database.getAllFromIndex('outbox', 'by_status', 'SYNCING');
  const failed = await database.getAllFromIndex('outbox', 'by_status', 'FAILED');
  return [...pending, ...interrupted, ...failed.filter((operation) => operation.retryCount < 10)];
}

export async function markOperationsSyncing(operations: OutboxOperation[]): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction('outbox', 'readwrite');
  await Promise.all(operations.map((operation) => transaction.store.put({ ...operation, syncStatus: 'SYNCING' })));
  await transaction.done;
}

export async function markOperationsSynced(operationIds: string[]): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction('outbox', 'readwrite');
  await Promise.all(operationIds.map((id) => transaction.store.delete(id)));
  await transaction.done;
}

export async function markOperationFailed(operation: OutboxOperation, message: string): Promise<void> {
  const database = await databasePromise;
  await database.put('outbox', { ...operation, syncStatus: 'FAILED', retryCount: operation.retryCount + 1, lastError: message });
}

export async function outboxCount(): Promise<number> {
  const database = await databasePromise;
  return database.count('outbox');
}

export async function saveCatalog(products: Product[]): Promise<void> {
  await (await databasePromise).put('catalog', { key: 'current', products, savedAt: new Date().toISOString() });
}
export async function cachedCatalog(): Promise<Product[]> {
  return (await (await databasePromise).get('catalog', 'current'))?.products ?? [];
}
export async function retryFailedOperations(): Promise<void> {
  const database = await databasePromise;
  const failed = await database.getAllFromIndex('outbox', 'by_status', 'FAILED');
  const tx = database.transaction('outbox', 'readwrite');
  await Promise.all(failed.map((operation) => tx.store.put({ ...operation, syncStatus: 'PENDING', retryCount: 0 })));
  await tx.done;
}
