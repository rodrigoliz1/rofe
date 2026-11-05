import { expect, test } from 'vitest';
import { prepareCatalogModifiers } from '../src/domain/catalogRollout';
import { priceOrder } from '../src/domain/pricing';
import type { DbProduct, DbRawInventory } from '../src/db';
const raw: DbRawInventory[] = [
  { id: 'sugar', name: 'Azúcar sin regularizar', unit: 'un', stock: 500, cost: 50 },
  { id: 'splenda', name: 'Splenda', unit: 'un', stock: 500, cost: 500 },
  { id: 'milk_whole', name: 'Entera', unit: 'ml', stock: 1000, cost: 40 },
  { id: 'milk_avena', name: 'Avena', unit: 'ml', stock: 1000, cost: 80 },
  { id: 'coffee_beans', name: 'Café', unit: 'g', stock: 1000, cost: 100 },
  { id: 'cup_cold_12oz', name: 'Vaso regular', unit: 'un', stock: 10, cost: 10 },
  { id: 'cup_cold_16oz', name: 'Vaso grande', unit: 'un', stock: 10, cost: 20 },
];
const product: DbProduct = { id: 'iced-latte', name: 'Latte', category: 'cold', description: '', icon: '', image: '', price: 55, customizable: true, recipe: { coffee_beans: 25, milk_whole: 280, cup_cold_12oz: 1 }, custom_variants: [{ title: 'Prueba antigua', options: [{ name: 'Opción antigua', priceModifier: 1 }] }] };
const espresso = { ...product, id: 'espresso', customizable: false, recipe: { coffee_beans: 25 }, custom_variants: [] };
test('rollout preserves stock, prices and recipes, and blocks unresolved sugar instead of interpreting units', () => {
  const original = JSON.stringify({ product, raw });
  const plan = prepareCatalogModifiers([product, espresso], raw);
  const groups = plan.patches[0].after;
  expect(groups.find(group => group.purpose === 'sugar')).toMatchObject({ enabled: false, options: [{ name: 'Poco', ingredientQuantity: 2 }, { name: 'Normal', ingredientQuantity: 4 }, { name: 'Mucho', ingredientQuantity: 8 }] });
  expect(groups[0]).toMatchObject({ title: 'Prueba antigua', enabled: false, options: product.custom_variants![0].options });
  expect(JSON.stringify({ product, raw })).toBe(original);
  expect(() => priceOrder([{ ...product, custom_variants: groups }], [{ productId: product.id, quantity: 1, selectedCustomVariants: { Azúcar: 'Normal' } }], raw)).toThrow();
});
test('real-style packet units, milk substitution and larger packaging are resolved without double-counting', () => {
  const groups = prepareCatalogModifiers([product, espresso], raw).patches[0].after;
  const configured = { ...product, custom_variants: groups };
  const quote = priceOrder([configured], [{ productId: product.id, quantity: 1, selectedCustomVariants: { Leche: 'Avena', Tamaño: 'Grande' }, quantitySelections: { Splenda: 2 } }], raw);
  expect(quote.total).toBe(82);
  expect(quote.items[0].recipeSnapshot).toMatchObject({ splenda: 2, cup_cold_16oz: 1 });
  expect(quote.items[0].recipeSnapshot?.milk_avena).toBeCloseTo(373.333, 3);
  expect(quote.items[0].preparation).toContain("Leche: Avena (373.333 ml)");
  expect(quote.items[0].recipeSnapshot?.cup_cold_12oz ?? 0).toBe(0);
  expect(quote.items[0].recipeSnapshot?.milk_whole ?? 0).toBe(0);
  expect(quote.items[0].recipeCostSnapshot).toBeGreaterThan(0);
  expect(prepareCatalogModifiers([configured, espresso], raw).patches).toHaveLength(0);
});
