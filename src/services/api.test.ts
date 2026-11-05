import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ConnectionError, apiJson, login, logout, getPrincipal } from './api';

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


it('retains the staff session when logout cannot reach the server, and clears it after confirmed revocation', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://rofe.test' } });
  const principal = { role: 'BARISTA', subjectId: 'barista-test', sessionId: 'session-test' };
  const transport = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'test-access-token', principal })))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', transport);
  await login('barista@rofe.test', 'test-only');
  await expect(logout()).rejects.toBeInstanceOf(ConnectionError);
  expect(getPrincipal()?.subjectId).toBe('barista-test');
  await logout();
  expect(getPrincipal()).toBeUndefined();
});
