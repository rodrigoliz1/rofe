import { describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DbProduct, DbRawInventory, DbOrder } from '../src/db';
import { JsonDbAdapter } from '../src/db';
import { priceOrder } from '../src/domain/pricing';
import { calculateRecipeConsumption } from '../src/domain/inventory';
import { modifierAvailability, availableRecipeStock, validateModifierConfiguration } from '../src/domain/modifiers';
// Quantities and prices below are an administrative TEST configuration, not ROFE defaults.
const raw: DbRawInventory[] = [
  { id: 'coffee_beans', name: 'Café', unit: 'g', stock: 1000, cost: 500 },
  { id: 'milk_whole', name: 'Leche entera', unit: 'ml', stock: 1000, cost: 32 },
  { id: 'milk_almendra', name: 'Leche de almendra', unit: 'ml', stock: 1000, cost: 90 },
  { id: 'sugar', name: 'Azúcar', unit: 'g', stock: 100, cost: 10 },
  { id: 'splenda', name: 'Splenda', unit: 'piece', stock: 8, cost: 16 },
];
const product: DbProduct = { id: 'latte', name: 'Latte prueba', description: '', image: '', icon: 'latte', category: 'coffee', customizable: true, price: 55, recipe: { coffee_beans: 18, milk_whole: 220 }, custom_variants: [
  { title: 'Azúcar', purpose: 'sugar', ingredientId: 'sugar', enabled: true, options: [3, 6, 9].map((ingredientQuantity, i) => ({ name: ['Poco', 'Normal', 'Mucho'][i], ingredientQuantity, priceModifier: 1 })) },
  { title: 'Splenda', purpose: 'splenda', kind: 'quantity', ingredientId: 'splenda', amountPerUnit: 1, min: 0, max: 4, pricePerUnit: 0.5, enabled: true, options: [] },
  { title: 'Leche', purpose: 'milk', ingredientId: 'milk_whole', options: [{ name: 'Almendra', ingredientId: 'milk_almendra', priceModifier: 15 }] },
  { title: 'Tamaño', purpose: 'size', options: [{ name: 'Grande', priceModifier: 12, recipeDeltas: { milk_whole: 110, coffee_beans: 9 } }] },
] };
const item = (selections: Record<string, string> = {}, counts: Record<string, number> = {}, quantity = 1) => ({ productId: product.id, quantity, selectedCustomVariants: selections, quantitySelections: counts });
describe('administrative modifier contract', () => {
  test('prices sugar grams, size and milk substitution and snapshots the exact recipe', () => {
    validateModifierConfiguration(product, raw);
    const result = priceOrder([product], [item({ 'Azúcar': 'Normal', 'Tamaño': 'Grande', Leche: 'Almendra' }, {}, 2)], raw);
    expect(result.total).toBe(166);
    expect(calculateRecipeConsumption(result.items)).toEqual(expect.arrayContaining([{ ingredientId: 'coffee_beans', quantity: 54 }, { ingredientId: 'milk_almendra', quantity: 660 }, { ingredientId: 'sugar', quantity: 12 }]));
    expect(result.items[0].recipeSnapshot).not.toHaveProperty('milk_whole');
    expect(result.items[0].preparation).toContain('Azúcar: Normal (6 g)');
    expect(result.items[0].preparation).toContain('Leche: Almendra (330 ml)');
    expect(result.items[0].recipeCostSnapshot).toBe(43.8);
    product.recipe!.milk_whole = 999;
    expect(calculateRecipeConsumption(result.items).find(i => i.ingredientId === 'milk_almendra')?.quantity).toBe(660);
    product.recipe!.milk_whole = 220;
  });
  test('counts whole Splenda envelopes, applies price per envelope and rejects invalid counts', () => {
    const result = priceOrder([product], [item({}, { Splenda: 2 })], raw);
    expect(result.total).toBe(56); expect(result.items[0].recipeSnapshot?.splenda).toBe(2); expect(result.items[0].preparation).toContain('Splenda: 2 sobres');
    for (const quantity of [-1, 1.5, 5]) expect(() => priceOrder([product], [item({}, { Splenda: quantity })], raw)).toThrow(/límites/);
    expect(() => priceOrder([product], [item({ 'Azúcar': 'Poco' }, { Splenda: 1 })], raw)).toThrow(/azúcar o Splenda/);
  });
  test('requires administrative quantities, correct units and applicable groups before enabling', () => {
    const bad = structuredClone(product); delete bad.custom_variants![1].max;
    expect(() => validateModifierConfiguration(bad, raw)).toThrow(/configuración/);
    const badUnits = raw.map(i => i.id === 'splenda' ? { ...i, unit: 'g' } : i);
    expect(() => validateModifierConfiguration(product, badUnits)).toThrow(/configuración/);
    expect(() => validateModifierConfiguration({ ...product, category: 'bakery' }, raw)).toThrow(/panadería/);
    expect(() => priceOrder([product], [{ ...item(), customization: { size: 'grande', milk: 'none', sweetness: 'none', temp: 'hot', extraShot: false } }], raw)).toThrow(/Administración/);
  });
  test('checks aggregate availability and reserved ingredients, not only each line separately', () => {
    const depleted = raw.map(i => i.id === 'splenda' ? { ...i, stock: 3, reservedStock: 2 } : i);
    expect(modifierAvailability(product, depleted).find(g => g.title === 'Splenda')?.availableMax).toBe(1);
    expect(() => priceOrder([product], [item({}, { Splenda: 2 })], depleted)).toThrow(/ingredientes/);
    expect(() => priceOrder([product], [item({}, { Splenda: 1 }), item({}, { Splenda: 1 })], depleted)).toThrow(/ingredientes/);
  });
  test('keeps feasible milk and ice combinations available when base ingredients run out', () => {
    const cold = structuredClone(product); cold.category = 'cold'; cold.recipe!.ice = 10;
    cold.custom_variants!.push({ title: 'Hielo', purpose: 'ice', options: [{ name: 'Normal', priceModifier: 0 }, { name: 'Sin hielo', priceModifier: 0, recipeDeltas: { ice: -10 } }] });
    const inventory = [...raw.map(i => i.id === 'milk_whole' ? { ...i, stock: 0 } : i), { id: 'ice', name: 'Hielo', unit: 'g', stock: 0, cost: 0 }];
    expect(availableRecipeStock(cold, inventory)).toBeGreaterThan(0);
    const options = modifierAvailability(cold, inventory);
    expect(options.find(g => g.title === 'Leche')?.options[0].available).toBe(true);
    expect(options.find(g => g.title === 'Hielo')?.options.find(o => o.name === 'Sin hielo')?.available).toBe(true);
    const result = priceOrder([cold], [item({ Leche: 'Almendra', Hielo: 'Sin hielo' })], inventory);
    expect(result.items[0].recipeSnapshot).not.toHaveProperty('ice');
  });
  test('legacy unquantified groups require administrative review and cannot bypass recipe validation', () => {
    const legacy = { ...product, custom_variants: [{ title: 'Endulzante', options: [{ name: 'Splenda', priceModifier: 0 }] }] };
    expect(modifierAvailability(legacy, raw)[0].enabled).toBe(false);
    expect(() => priceOrder([legacy], [item({ Endulzante: 'Splenda' })], raw)).toThrow(/ya no está disponible/);
    expect(() => validateModifierConfiguration(legacy, raw)).toThrow(/Administración/);
    expect(priceOrder([legacy], [item()], raw).total).toBe(55);
  });
  test('payment replay consumes the customized snapshot once and cancellation consumes nothing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rofe-modifier-ledger-'));
    try {
      const db = new JsonDbAdapter(join(directory, 'db.json')); await db.initialize();
      await db.createRawInventoryItem(raw[3]); await db.createRawInventoryItem(raw[4]);
      const inventory = await db.getRawInventory();
      const result = priceOrder([product], [item({}, { Splenda: 2 })], inventory);
      const id = randomUUID(); const order: DbOrder = { id, operationId: id, items: result.items, total: result.total, customerName: 'Prueba', paymentMethod: 'card', paymentStatus: 'PENDING', status: 'PENDING_PAYMENT', createdAt: new Date().toISOString() };
      await db.createOrder(order);
      const consumption = calculateRecipeConsumption(result.items);
      const results = await Promise.all([1, 2, 3].map(() => db.confirmOrderPayment(id, 'fixture-payment', consumption)));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await db.getRawInventory()).find(i => i.id === 'splenda')?.stock).toBe(6);
      const cancelled = { ...order, id: randomUUID(), operationId: randomUUID() }; await db.createOrder(cancelled); await db.updateOrderStatus(cancelled.id, 'CANCELLED');
      expect(await db.confirmOrderPayment(cancelled.id, 'late-payment', consumption)).toBe(false);
      expect((await db.getRawInventory()).find(i => i.id === 'splenda')?.stock).toBe(6);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
