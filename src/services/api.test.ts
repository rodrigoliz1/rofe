import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ConnectionError, apiUrl, apiJson, login, logout, getPrincipal } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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

it('shows the actionable cash backend error together with its support code', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://rofe.test' } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    error: { code: 'CASH_DATABASE_UPDATE_REQUIRED', message: 'La caja necesita una actualización del sistema. Contacta a Administración.' },
    requestId: 'cash-support-test',
  }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
  await expect(apiJson('/api/admin/cash/session/open')).rejects.toThrow('La caja necesita una actualización del sistema. Contacta a Administración. Código de soporte: cash-support-test.');
});

it('a preview ignores a production API URL even when it was mistakenly inherited', () => {
  vi.stubGlobal('window', { location: { origin: 'https://isolated-preview.test' } });
  vi.stubEnv('VITE_API_URL', 'https://production.example');
  vi.stubEnv('VITE_BACKEND_DISABLED', 'true');
  expect(apiUrl('/api/orders')).toBe('https://isolated-preview.test/api/orders');
});
