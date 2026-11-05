import { describe, expect, it } from 'vitest';
import { cartTotal, configuredItemId, toOrderItemInputs } from './cart';
import type { CartItem } from '../types';

const item = {
  id: 'configured-latte',
  product: { id: 'latte', name: 'Latte', description: '', price: 55, category: 'coffee', icon: 'latte', customizable: true },
  quantity: 2,
  customization: { size: 'regular', milk: 'whole', sweetness: 'none', temp: 'hot', extraShot: false },
  totalPrice: 110,
} satisfies CartItem;

describe('cart payload', () => {
  it('sends product selections without treating the displayed total as authoritative', () => {
    expect(cartTotal([item])).toBe(110);
    expect(toOrderItemInputs([item])).toEqual([{ productId: 'latte', quantity: 2, customization: item.customization, selectedCustomVariants: undefined, quantitySelections: undefined }]);
    expect(toOrderItemInputs([item])[0]).not.toHaveProperty('totalPrice');
  });
});


describe('configured product identity', () => {
  it('keeps different sizes, milk and Unicode options separate', () => {
    const base = configuredItemId('latte', item.customization);
    expect(configuredItemId('latte', { ...item.customization, size: 'grande' })).not.toBe(base);
    expect(configuredItemId('latte', { ...item.customization, milk: 'avena' })).not.toBe(base);
    expect(() => configuredItemId('latte', item.customization, { Jarabe: 'Vainilla ☕' })).not.toThrow();
  });
  it('never merges different envelope counts and preserves quantities in the backend payload', () => {
    const one = configuredItemId('latte', item.customization, {}, { Splenda: 1 });
    const two = configuredItemId('latte', item.customization, {}, { Splenda: 2 });
    expect(one).not.toBe(two);
    expect(toOrderItemInputs([{ ...item, quantitySelections: { Splenda: 2 } }])[0].quantitySelections).toEqual({ Splenda: 2 });
  });
  it('merges identical choices regardless of selection order', () => {
    expect(configuredItemId('latte', item.customization, { A: 'á', B: '豆' })).toBe(configuredItemId('latte', item.customization, { B: '豆', A: 'á' }));
  });
});
