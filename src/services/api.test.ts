import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ConnectionError, apiJson } from './api';

afterEach(() => vi.unstubAllGlobals());
describe('transport boundary', () => {
  it('keeps a validation failure distinct from a lost connection', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://rofe.test' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'No hay inventario suficiente.' } }), { status: 409 })));
    await expect(apiJson('/api/orders')).rejects.toBeInstanceOf(ApiError);
    await expect(apiJson('/api/orders')).rejects.not.toBeInstanceOf(ConnectionError);
  });
  it('translates a network failure without exposing browser errors', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://rofe.test' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiJson('/api/orders')).rejects.toBeInstanceOf(ConnectionError);
  });
});
