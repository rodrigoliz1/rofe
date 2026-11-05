import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnv, resetEnvForTests } from '../src/config/env';
afterEach(() => { vi.unstubAllEnvs(); resetEnvForTests(); });
function configure() {
  resetEnvForTests();
  vi.stubEnv('JWT_ACCESS_SECRET', 'a'.repeat(40)); vi.stubEnv('JWT_REFRESH_SECRET', 'b'.repeat(40));
  vi.stubEnv('PUBLIC_ORDERING_URL', ''); vi.stubEnv('STRIPE_SECRET_KEY', ''); vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
}
describe('production configuration', () => {
  it('accepts empty optional fields in the development example', () => {
    configure(); vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('SUPABASE_URL', ''); vi.stubEnv('SUPABASE_SERVICE_KEY', ''); vi.stubEnv('POINT_DEVICE_ID', '');
    expect(getEnv().SUPABASE_URL).toBeUndefined();
  });
  it('refuses production without the real database and terminal', () => {
    configure(); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('SUPABASE_URL', ''); vi.stubEnv('SUPABASE_SERVICE_KEY', ''); vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', ''); vi.stubEnv('POINT_DEVICE_ID', '');
    expect(() => getEnv()).toThrow(/SUPABASE_URL.*MERCADO_PAGO_ACCESS_TOKEN/);
  });
  it('refuses a shared signing secret for access and refresh tokens', () => {
    configure(); vi.stubEnv('JWT_REFRESH_SECRET', 'a'.repeat(40));
    expect(() => getEnv()).toThrow('deben ser diferentes');
  });
  it('requires an HTTPS public pickup origin in production', () => {
    configure(); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_ORDERING_URL', 'http://localhost:5173');
    expect(() => getEnv()).toThrow(/PUBLIC_ORDERING_URL/);
  });
  it('trusts the Vercel domains and enables serverless realtime on Vercel', () => {
    configure(); vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('VERCEL', '1'); vi.stubEnv('ALLOWED_ORIGINS', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'rofe.vercel.app'); vi.stubEnv('VERCEL_URL', 'rofe-abc.vercel.app');
    const env = getEnv();
    expect(env.ALLOWED_ORIGINS.split(',')).toEqual(expect.arrayContaining(['https://rofe.vercel.app', 'https://rofe-abc.vercel.app']));
    expect(env.REALTIME_POLL_MS).toBe(3000);
    expect(env.SSE_MAX_DURATION_MS).toBe(270000);
  });
});
