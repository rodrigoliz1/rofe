import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationId } from './id';

afterEach(() => vi.unstubAllGlobals());

describe('createOperationId', () => {
  it('uses the native UUID generator when available', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    vi.stubGlobal('crypto', { randomUUID });
    expect(createOperationId()).toBe('11111111-1111-4111-8111-111111111111');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates a valid v4 UUID without randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab) });
    expect(createOperationId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
