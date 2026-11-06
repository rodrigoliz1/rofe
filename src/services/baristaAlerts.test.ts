import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
import type { Order } from '../types';
import { unannouncedOrders } from './baristaAlerts';
const order = (id: string, status: Order['status'], paymentMethod: Order['paymentMethod'] = 'cash') => ({ id, status, paymentMethod } as Order);
describe('barista alert ledger', () => {
  it('announces pending cash once, despite payment, duplicate events and reconnection snapshots', () => {
    const ledger = new Set<string>();
    expect(unannouncedOrders([order('a', 'PENDING_PAYMENT'), order('a', 'PENDING_PAYMENT')], ledger)).toEqual(['a']);
    ledger.add('a');
    expect(unannouncedOrders([order('a', 'PAID'), order('b', 'CANCELLED'), order('c', 'PENDING_PAYMENT', 'card')], ledger)).toEqual([]);
    expect(unannouncedOrders([order('d', 'PAID'), order('e', 'PENDING_PAYMENT')], ledger)).toEqual(['d', 'e']);
  });
});

describe('supplied MP3 playback', () => {
  const setup = async () => {
    const context = { state: 'suspended', destination: {}, resume: vi.fn(async () => { context.state = 'running'; }), decodeAudioData: vi.fn(async () => ({ duration: 1.49 })), createBufferSource: vi.fn(() => ({ buffer: undefined, connect: vi.fn(), start: vi.fn(), disconnect: vi.fn(), onended: undefined })) };
    vi.stubGlobal('window', { AudioContext: class { constructor() { return context; } } });
    const fetchSound = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchSound);
    const module = await import('./baristaAlerts');
    return { module, context, fetchSound };
  };
  it('decodes the supplied MP3 once, unlocks on gesture, and schedules playback only when ready', async () => {
    const { module, context, fetchSound } = await setup();
    expect(module.playBaristaAlert()).toBe(false);
    expect(await Promise.all([module.enableBaristaAudio(), module.enableBaristaAudio()])).toEqual([true, true]);
    expect(fetchSound).toHaveBeenCalledTimes(1);
    expect(String(fetchSound.mock.calls[0][0])).toContain('nuevo_pedido.mp3');
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(module.playBaristaAlert()).toBe(true);
    expect(context.createBufferSource.mock.results[0].value.start).toHaveBeenCalledOnce();
    context.state = 'suspended';
    expect(module.playBaristaAlert()).toBe(false);
    expect(await module.enableBaristaAudio()).toBe(true);
    expect(fetchSound).toHaveBeenCalledTimes(1);
  });
  it('does not claim audio is ready after a download failure and allows retry', async () => {
    const { module, fetchSound } = await setup();
    fetchSound.mockResolvedValueOnce(new Response('', { status: 503 }));
    expect(await module.enableBaristaAudio()).toBe(false);
    expect(module.playBaristaAlert()).toBe(false);
    expect(await module.enableBaristaAudio()).toBe(true);
    expect(fetchSound).toHaveBeenCalledTimes(2);
  });
  it('does not consume the alert when audio cannot start', async () => {
    const { module, context } = await setup();
    expect(await module.enableBaristaAudio()).toBe(true);
    context.createBufferSource.mockImplementationOnce(() => { throw new Error('audio unavailable'); });
    expect(module.playBaristaAlert()).toBe(false);
  });
});
