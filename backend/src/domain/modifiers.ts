import { z } from 'zod';
import type { DbProduct, DbRawInventory, CustomVariantGroup } from '../db';
import { AppError } from '../utils/errors';

const quantities = z.record(z.string().min(1).max(100), z.number().finite().min(-1_000_000).max(1_000_000));
export const modifierGroupSchema = z.object({
  title: z.string().trim().min(1).max(80),
  kind: z.enum(['choice', 'quantity']).optional(),
  purpose: z.enum(['general', 'size', 'milk', 'ice', 'temperature', 'coffee', 'sugar', 'splenda']).optional(),
  enabled: z.boolean().optional(), required: z.boolean().optional(),
  ingredientId: z.string().min(1).max(100).optional(),
  amountPerUnit: z.number().positive().max(1_000_000).optional(),
  min: z.number().int().min(0).max(50).optional(), max: z.number().int().min(0).max(50).optional(),
  pricePerUnit: z.number().min(0).max(100_000).optional(),
  options: z.array(z.object({
    name: z.string().trim().min(1).max(80), priceModifier: z.number().min(0).max(100_000),
    ingredientId: z.string().min(1).max(100).optional(), ingredientQuantity: z.number().positive().max(1_000_000).optional(),
    recipeDeltas: quantities.optional(), instruction: z.string().trim().max(160).optional(),
  })).max(30),
});
const countUnits = new Set(['piece', 'pieza', 'un', 'unidad', 'unidades', 'sobre', 'sobres']);
const needsReview = (group: CustomVariantGroup) => !group.purpose;
const active = (group: CustomVariantGroup) => group.enabled !== false && !needsReview(group);
const configuredError = (title: string) => new AppError(400, 'MODIFIER_CONFIGURATION_REQUIRED', `Completa y revisa la configuración de ${title} en Administración antes de habilitarla.`);

export function validateModifierConfiguration(product: Pick<DbProduct, 'recipe' | 'custom_variants' | 'customizable' | 'category'>, inventory: DbRawInventory[], allowLegacyDrafts = false) {
  const ingredients = new Map(inventory.map(item => [item.id, item]));
  for (const [id, amount] of Object.entries(product.recipe ?? {})) if (amount > 0 && !ingredients.has(id)) throw new AppError(400, 'RECIPE_INGREDIENT_NOT_FOUND', 'La receta contiene un insumo que no existe en inventario.');
  const seen = new Set<string>();
  for (const group of product.custom_variants ?? []) {
    if (seen.has(group.title)) throw new AppError(400, 'DUPLICATE_MODIFIER', 'Cada grupo de personalización debe tener un nombre único.');
    seen.add(group.title);
    if (needsReview(group) && group.enabled !== false && !allowLegacyDrafts) throw configuredError(group.title);
    if (!active(group)) continue;
    if (!product.customizable) throw new AppError(400, 'PRODUCT_NOT_CUSTOMIZABLE', 'Activa las personalizaciones del producto antes de habilitar opciones.');
    if (product.category === 'bakery' && ['milk', 'ice', 'coffee', 'sugar', 'splenda', 'size'].includes(group.purpose ?? '')) throw new AppError(400, 'INCOMPATIBLE_MODIFIER', 'Esta personalización de bebida no corresponde a panadería.');
    if (group.ingredientId && !ingredients.has(group.ingredientId)) throw configuredError(group.title);
    if (group.purpose === 'milk' && !((product.recipe?.[group.ingredientId ?? ''] ?? 0) > 0)) throw configuredError(group.title);
    if (group.purpose === 'coffee' && !((product.recipe?.coffee_beans ?? 0) > 0)) throw new AppError(400, 'INCOMPATIBLE_MODIFIER', 'Los shots de café sólo se habilitan en recetas que contienen café.');
    if (group.purpose === 'splenda' && (group.kind !== 'quantity' || group.amountPerUnit !== 1 || !countUnits.has(ingredients.get(group.ingredientId ?? '')?.unit ?? ''))) throw configuredError(group.title);
    if (group.kind === 'quantity') {
      if (!group.ingredientId || group.amountPerUnit === undefined || group.min === undefined || group.max === undefined || group.max < group.min || group.pricePerUnit === undefined) throw configuredError(group.title);
    } else {
      if (!group.options.length || new Set(group.options.map(option => option.name)).size !== group.options.length) throw configuredError(group.title);
      if (group.purpose === 'sugar' && (ingredients.get(group.ingredientId ?? '')?.unit !== 'g' || group.options.length !== 3 || !['Poco', 'Normal', 'Mucho'].every(name => group.options.some(option => option.name === name && option.ingredientQuantity! > 0)))) throw configuredError(group.title);
      if (group.purpose === 'sugar') { const amounts = ['Poco', 'Normal', 'Mucho'].map(name => group.options.find(o => o.name === name)!.ingredientQuantity!); if (!(amounts[0] < amounts[1] && amounts[1] < amounts[2])) throw configuredError(group.title); }
      for (const option of group.options) {
        if (option.ingredientId && !ingredients.has(option.ingredientId)) throw configuredError(group.title);
        if (group.purpose === 'milk' && (!option.ingredientId || ingredients.get(option.ingredientId)?.unit !== ingredients.get(group.ingredientId!)?.unit)) throw configuredError(group.title);
        for (const id of Object.keys(option.recipeDeltas ?? {})) if (!ingredients.has(id)) throw configuredError(group.title);
      }
    }
  }
}

export function resolveModifiers(product: DbProduct, selections: Record<string, string> = {}, counts: Record<string, number> = {}, inventory?: DbRawInventory[]) {
  const groups = (product.custom_variants ?? []).filter(active);
  const recipe = { ...product.recipe };
  const modifiers: Array<{ name: string; amount: number }> = [];
  const preparation: string[] = [];
  const ingredients = new Map(inventory?.map(item => [item.id, item]));
  for (const name of Object.keys(selections)) if (!groups.some(g => g.title === name && g.kind !== 'quantity')) throw new AppError(400, 'INVALID_MODIFIER', `La opción ${selections[name]} ya no está disponible.`);
  for (const name of Object.keys(counts)) if (!groups.some(g => g.title === name && g.kind === 'quantity')) throw new AppError(400, 'INVALID_MODIFIER', `La cantidad ${name} ya no está disponible.`);
  if (!product.customizable && (Object.keys(selections).length || Object.values(counts).some(Boolean))) throw new AppError(400, 'INVALID_MODIFIER', 'Este producto no admite estas personalizaciones.');
  // Size changes first; milk substitutions transfer the resulting quantity, including size.
  const priority = (g: CustomVariantGroup) => g.purpose === 'size' ? 0 : g.purpose === 'milk' ? 1 : 2;
  let sweetener = '';
  for (const group of [...groups].sort((a, b) => priority(a) - priority(b))) {
    let quantity: number;
    if (group.kind === 'quantity') {
      quantity = counts[group.title] ?? 0;
      if (!Number.isInteger(quantity) || group.min === undefined || group.max === undefined || quantity < group.min || quantity > group.max || !group.ingredientId || group.amountPerUnit === undefined || group.pricePerUnit === undefined) throw new AppError(400, 'INVALID_MODIFIER_QUANTITY', `Revisa los límites configurados de ${group.title}.`);
      if (!quantity) continue;
      recipe[group.ingredientId] = (recipe[group.ingredientId] ?? 0) + quantity * group.amountPerUnit;
      const unit = group.purpose === 'splenda' ? 'sobres' : ingredients.get(group.ingredientId)?.unit ?? 'unidades';
      const label = group.purpose === 'splenda' ? `${group.title}: ${quantity} ${quantity === 1 ? 'sobre' : 'sobres'}` : `${group.title}: ${quantity} unidades (${quantity * group.amountPerUnit} ${unit})`;
      modifiers.push({ name: label, amount: quantity * group.pricePerUnit }); preparation.push(label);
    } else {
      const name = selections[group.title];
      if (!name) { if (group.required) throw new AppError(400, 'MODIFIER_REQUIRED', `Selecciona ${group.title}.`); continue; }
      const option = group.options.find(candidate => candidate.name === name);
      if (!option) throw new AppError(400, 'INVALID_MODIFIER', `La opción ${name} ya no está disponible.`);
      if (group.purpose === 'milk') {
        if (!group.ingredientId || !option.ingredientId || !recipe[group.ingredientId]) throw configuredError(group.title);
        const amount = recipe[group.ingredientId]; delete recipe[group.ingredientId]; recipe[option.ingredientId] = (recipe[option.ingredientId] ?? 0) + amount;
      }
      if (group.ingredientId && option.ingredientQuantity) recipe[group.ingredientId] = (recipe[group.ingredientId] ?? 0) + option.ingredientQuantity;
      for (const [id, amount] of Object.entries(option.recipeDeltas ?? {})) recipe[id] = (recipe[id] ?? 0) + amount;
      const unit = ingredients.get(group.ingredientId ?? '')?.unit ?? (group.purpose === 'sugar' ? 'g' : '');
      const milkAmount = group.purpose === 'milk' && option.ingredientId ? ` (${Number(recipe[option.ingredientId].toFixed(3))} ${ingredients.get(option.ingredientId)?.unit ?? 'ml'})` : '';
      const label = `${group.title}: ${name}${milkAmount}${option.ingredientQuantity ? ` (${option.ingredientQuantity} ${unit})` : ''}`;
      modifiers.push({ name: label, amount: option.priceModifier }); preparation.push(option.instruction ? `${label} · ${option.instruction}` : label);
      quantity = 1;
    }
    if (quantity && ['sugar', 'splenda'].includes(group.purpose ?? '')) {
      if (sweetener && sweetener !== group.purpose) throw new AppError(400, 'SWEETENER_CONFLICT', 'Elige azúcar o Splenda para esta bebida.');
      sweetener = group.purpose!;
    }
  }
  for (const [id, amount] of Object.entries(recipe)) {
    if (!Number.isFinite(amount) || amount < 0) throw new AppError(400, 'INCOMPATIBLE_MODIFIERS', 'Estas opciones no forman una receta válida. Revisa la configuración administrativa.');
    if (!amount) delete recipe[id];
    if (inventory && amount > 0 && !ingredients.has(id)) throw new AppError(409, 'INGREDIENT_UNAVAILABLE', 'Un ingrediente de esta receta no está disponible. Solicita ayuda al equipo.');
  }
  const ingredientLabels = Object.entries(recipe).map(([id, amount]) => `${ingredients.get(id)?.name ?? id}: ${Number(amount.toFixed(3))} ${ingredients.get(id)?.unit ?? ''}`.trim());
  const unitCost = Object.entries(recipe).reduce((sum, [id, amount]) => { const item = ingredients.get(id); return sum + (item && item.stock > 0 ? amount * item.cost / item.stock : 0); }, 0);
  return { recipe, modifiers, preparation, ingredientLabels, unitCost };
}

/** Bounded search over configured choices so an out-of-stock base milk/ice does not hide valid substitutions. */
export function availableRecipeStock(product: DbProduct, inventory: DbRawInventory[], fixed: Record<string, string> = {}, fixedCounts: Record<string, number> = {}): number | undefined {
  const groups = (product.custom_variants ?? []).filter(active);
  const choices = groups.filter(g => g.kind !== 'quantity');
  const counts = { ...Object.fromEntries(groups.filter(g => g.kind === 'quantity').map(g => [g.title, g.min ?? 0])), ...fixedCounts };
  const ingredients = new Map(inventory.map(i => [i.id, i]));
  let visited = 0;
  let limited = false;
  const search = (index: number, selections: Record<string, string>): number => {
    if (visited >= 512) { limited = true; return 0; }
    if (index === choices.length) {
      visited++;
      try {
        const recipe = resolveModifiers(product, selections, counts, inventory).recipe;
        const entries = Object.entries(recipe).filter(([, q]) => q > 0);
        return entries.length ? Math.max(0, Math.min(...entries.map(([id, amount]) => { const i = ingredients.get(id); return i ? Math.floor((i.stock - (i.reservedStock ?? 0)) / amount) : 0; }))) : 0;
      } catch { return 0; }
    }
    const group = choices[index];
    const candidates = fixed[group.title] ? [fixed[group.title]] : [...(group.required ? [] : [undefined]), ...group.options.map(o => o.name)];
    for (const name of candidates) { const next = { ...selections }; if (name) next[group.title] = name; else delete next[group.title]; const stock = search(index + 1, next); if (stock > 0) return stock; }
    return 0;
  };
  const stock = search(0, {});
  return stock > 0 ? stock : limited ? undefined : 0;
}

export function modifierAvailability(product: DbProduct, inventory: DbRawInventory[]): CustomVariantGroup[] {
  const ingredients = new Map(inventory.map(i => [i.id, i]));
  return (product.custom_variants ?? []).map(group => {
    let availableMax: number | undefined;
    if (group.kind === 'quantity' && group.ingredientId && group.amountPerUnit) {
      const ingredient = ingredients.get(group.ingredientId);
      availableMax = Math.max(0, Math.min(group.max ?? 0, Math.floor(((ingredient?.stock ?? 0) - (ingredient?.reservedStock ?? 0)) / group.amountPerUnit)));
      while (availableMax > 0 && availableRecipeStock(product, inventory, {}, { [group.title]: availableMax }) === 0) availableMax--;
    }
    return { ...group, enabled: active(group), availableMax, options: group.options.map(option => { const stock = availableRecipeStock(product, inventory, { [group.title]: option.name }); return { ...option, available: stock === undefined ? undefined : stock > 0 }; }) };
  });
}
