import { describe, expect, it } from 'vitest';
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
