import { describe, expect, it } from 'vitest';
import { calculateOperatingResult } from '../src/domain/accounting';
import { calculateCashDifference, totalDenominations } from '../src/domain/cash';
import { applyPurchaseValue, applyWasteValue, calculateRecipeConsumption, recipeCost } from '../src/domain/inventory';
import { priceOrder } from '../src/domain/pricing';
import type { DbProduct } from '../src/db';
import { buildOperationalReport } from '../src/accounting/reports';
import { applyAuthorizedDiscount } from '../src/domain/discounts';

const latte: DbProduct = {
  id: 'latte',
  name: 'Latte',
  description: 'Espresso con leche',
  price: 55,
  category: 'coffee',
  icon: 'latte',
  customizable: true,
  image: '/latte.webp',
  recipe: { coffee_beans: 18, milk_whole: 250, cup_hot_8oz: 1 },
  custom_variants: [{ title: 'Jarabe', options: [{ name: 'Vainilla', priceModifier: 8 }] }],
};

describe('server-controlled pricing', () => {
  it('prices size, milk, shot and catalog variants without a client total', () => {
    const result = priceOrder([latte], [{
      productId: 'latte', quantity: 2,
      customization: { size: 'grande', milk: 'avena', sweetness: 'none', temp: 'hot', extraShot: true },
      selectedCustomVariants: { Jarabe: 'Vainilla' },
    }]);
    expect(result.items[0].unitPrice).toBe(105);
    expect(result.total).toBe(210);
  });

  it('rejects modifiers that are not in the product catalog', () => {
    expect(() => priceOrder([latte], [{ productId: 'latte', quantity: 1, selectedCustomVariants: { Jarabe: 'Administrador gratis' } }])).toThrow(/ya no está disponible/);
  });

  it('applies only an explicit, server-authorized discount and never makes totals negative', () => {
    const pricing = priceOrder([latte], [{ productId: 'latte', quantity: 2 }]);
    expect(applyAuthorizedDiscount(pricing).total).toBe(110);
    expect(applyAuthorizedDiscount(pricing, { type: 'PERCENTAGE', value: 10, reason: 'Promoción autorizada', authorizedBy: 'manager-1' })).toMatchObject({ discount: 11, total: 99 });
    expect(applyAuthorizedDiscount(pricing, { type: 'FIXED', value: 500, reason: 'Recuperación de servicio', authorizedBy: 'manager-1' })).toMatchObject({ discount: 110, total: 0 });
  });
});

describe('inventory and costing', () => {
  it('applies recipe substitutions and extra shots', () => {
    const priced = priceOrder([latte], [{ productId: 'latte', quantity: 2, customization: { size: 'grande', milk: 'almendra', sweetness: 'none', temp: 'hot', extraShot: true } }]);
    expect(calculateRecipeConsumption(priced.items)).toEqual(expect.arrayContaining([
      { ingredientId: 'coffee_beans', quantity: 90 },
      { ingredientId: 'milk_almendra', quantity: 750 },
    ]));
  });

  it('calculates theoretical recipe cost from current weighted inventory value', () => {
    expect(recipeCost(latte, [
      { id: 'coffee_beans', name: 'Café', unit: 'g', stock: 1000, cost: 500 },
      { id: 'milk_whole', name: 'Leche', unit: 'ml', stock: 1000, cost: 32 },
      { id: 'cup_hot_8oz', name: 'Vaso', unit: 'piece', stock: 100, cost: 180 },
    ])).toBe(18.8);
  });

  it('updates weighted inventory value for purchases and waste without hiding cost', () => {
    expect(applyPurchaseValue({ stock: 100, totalCost: 200, addedStock: 50, addedCost: 150 })).toEqual({ stock: 150, totalCost: 350, averageUnitCost: 350 / 150 });
    expect(applyWasteValue({ stock: 150, totalCost: 350, quantity: 15 })).toEqual({ stock: 135, totalCost: 315, unitCost: 350 / 150, costSnapshot: 35 });
  });
});

describe('cash and accounting', () => {
  it('totals denominations and preserves negative differences', () => {
    expect(totalDenominations({ bill_200: 2, coin_10: 3, coin_0_50: 1 })).toBe(430.5);
    expect(calculateCashDifference(1000, 987.5)).toBe(-12.5);
  });

  it('does not clamp operating losses to zero', () => {
    expect(calculateOperatingResult({ revenue: 10_000, costOfGoodsSold: 3_000, operatingExpenses: 8_000 })).toEqual({ grossMargin: 7_000, operatingProfit: -1_000 });
  });

  it('builds operational reporting without clamping a loss', () => {
    const report = buildOperationalReport({
      orders: [{ id: 'o1', customerName: 'Ana', items: [{ productName: 'Latte', product: latte, quantity: 2, subtotal: 110 }], total: 110, status: 'COMPLETED', paymentMethod: 'cash', createdAt: '2026-01-01T10:00:00Z' }],
      transactions: [{ type: 'manual_expense', amount: 200, description: 'Gasolina', denominations: {}, created_at: '2026-01-01T11:00:00Z' }],
      movements: [{ id: 'm1', ingredientId: 'coffee_beans', quantity: -36, movementType: 'SALE', orderId: 'o1', unitCostSnapshot: 0.5, createdAt: '2026-01-01T10:00:00Z' }],
      purchases: [], waste: [],
    });
    expect(report).toMatchObject({ revenue: 110, tickets: 1, averageTicket: 110, costOfGoodsSold: 18, grossMargin: 92, operatingResult: -108 });
  });
});
