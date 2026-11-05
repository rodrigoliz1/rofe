import type { CustomVariantGroup, DbProduct, DbRawInventory } from '../db';
import { validateModifierConfiguration } from './modifiers';

/** Additive configuration only: never changes base recipes, prices, stock or history. */
export function prepareCatalogModifiers(products: DbProduct[], inventory: DbRawInventory[]) {
  const patches: Array<{ id: string; before: CustomVariantGroup[]; after: CustomVariantGroup[] }> = [];
  const review: Array<{ productId: string; reason: string }> = [];
  const raw = new Map(inventory.map(item => [item.id, item]));
  const shot = products.find(product => product.id === 'espresso')?.recipe?.coffee_beans;
  for (const product of products) {
    const before = product.custom_variants ?? [];
    const groups = before.map(group => group.purpose ? structuredClone(group) : { ...structuredClone(group), enabled: false });
    const add = (group: CustomVariantGroup) => {
      if (!groups.some(existing => existing.purpose === group.purpose)) {
        // Preserve administrative titles and options even when an old title collides.
        if (groups.some(existing => existing.title === group.title)) group.title += ' · receta';
        groups.push(group);
      }
    };
    if (product.customizable && ['coffee', 'cold'].includes(product.category) && product.recipe) {
      const sugar = raw.get('sugar');
      add({ title: 'Azúcar', purpose: 'sugar', enabled: sugar?.unit === 'g', ingredientId: 'sugar', options: [2, 4, 8].map((ingredientQuantity, index) => ({ name: ['Poco', 'Normal', 'Mucho'][index], ingredientQuantity, priceModifier: 0 })) });
      if (sugar?.unit !== 'g') review.push({ productId: product.id, reason: 'Azúcar deshabilitada: las existencias actuales no están medidas en gramos.' });
      if (raw.has('splenda')) add({ title: 'Splenda', purpose: 'splenda', kind: 'quantity', enabled: ['un', 'piece', 'sobre', 'sobres', 'pieza', 'unidad', 'unidades'].includes(raw.get('splenda')!.unit), ingredientId: 'splenda', amountPerUnit: 1, min: 0, max: 2, pricePerUnit: 0, options: [] });
      if (product.recipe.milk_whole) add({ title: 'Leche', purpose: 'milk', enabled: true, ingredientId: 'milk_whole', options: ['milk_whole', 'milk_light', 'milk_avena', 'milk_almendra'].filter(id => raw.get(id)?.unit === raw.get('milk_whole')?.unit).map(id => ({ name: raw.get(id)!.name, ingredientId: id, priceModifier: ['milk_avena', 'milk_almendra'].includes(id) ? 15 : 0 })) });
      if (product.recipe.coffee_beans && shot && shot > 0) add({ title: 'Shots adicionales', purpose: 'coffee', kind: 'quantity', enabled: true, ingredientId: 'coffee_beans', amountPerUnit: shot, min: 0, max: 1, pricePerUnit: 15, options: [] });
      if (product.category === 'coffee' && product.recipe.milk_whole) add({ title: 'Temperatura', purpose: 'temperature', enabled: true, options: [{ name: 'Caliente', priceModifier: 0 }, { name: 'Tibio', priceModifier: 0, instruction: 'Servir tibio; evitar sobrecalentar la leche.' }] });
      const cup = product.recipe.cup_cold_12oz ? ['cup_cold_12oz', 'cup_cold_16oz', 16 / 12, 355] as const : product.recipe.cup_hot_8oz ? ['cup_hot_8oz', 'cup_hot_12oz', 1.5, 237] as const : undefined;
      if (cup && raw.has(cup[1])) {
        const liquids = Object.entries(product.recipe).filter(([id]) => raw.get(id)?.unit === 'ml');
        const measured = liquids.reduce((sum, [, amount]) => sum + amount, 0);
        const enabled = measured > 0 && measured <= cup[3];
        const deltas = Object.fromEntries(Object.entries(product.recipe).filter(([id]) => ['g', 'ml'].includes(raw.get(id)?.unit ?? '')).map(([id, amount]) => [id, Math.round(amount * (cup[2] - 1) * 1000) / 1000]));
        add({ title: 'Tamaño', purpose: 'size', enabled, options: [{ name: 'Regular', priceModifier: 0 }, { name: 'Grande', priceModifier: 12, recipeDeltas: { ...deltas, [cup[0]]: -1, [cup[1]]: 1 }, instruction: 'Usar el vaso grande indicado en la receta.' }] });
        if (!enabled) review.push({ productId: product.id, reason: 'Tamaño en borrador: revisar líquido medido frente a capacidad del vaso base antes de habilitar.' });
      }
      if (!product.recipe.ice && product.category === 'cold') review.push({ productId: product.id, reason: 'No se ofrece nivel de hielo: la receta base no especifica su cantidad.' });
    }
    validateModifierConfiguration({ ...product, custom_variants: groups }, inventory);
    if (JSON.stringify(before) !== JSON.stringify(groups)) patches.push({ id: product.id, before, after: groups });
  }
  return { patches, review };
}
