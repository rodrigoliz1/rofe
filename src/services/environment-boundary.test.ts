import { describe, expect, it, vi } from 'vitest';
// Test the actual serverless entry guard; it must run before importing the backend.
// @ts-expect-error The entry module is native JavaScript for Vercel.
import { deploymentHandler } from '../../api/environment-boundary.js';

describe('deployment isolation', () => {
  it.each(['preview', 'development', undefined])('never loads the backend for Vercel %s', async VERCEL_ENV => {
    const load = vi.fn();
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await deploymentHandler(load, { VERCEL: '1', VERCEL_ENV })({}, response);
    expect(load).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json.mock.calls[0][0].error.code).toBe('PREVIEW_BACKEND_DISABLED');
  });
  it('preserves the production handler', async () => {
    const app = vi.fn(); const load = vi.fn(async () => ({ app }));
    await deploymentHandler(load, { VERCEL: '1', VERCEL_ENV: 'production' })('request', 'response');
    expect(app).toHaveBeenCalledWith('request', 'response');
  });
});
