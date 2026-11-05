import type { DbProduct, DbRawInventory } from '../db';
import type { PricedOrderItem } from './pricing';
import { AppError } from '../utils/errors';
import { toMoney } from './pricing';

export interface IngredientConsumption {
  ingredientId: string;
  quantity: number;
}

export function calculateRecipeConsumption(items: PricedOrderItem[]): IngredientConsumption[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const recipe = item.recipeSnapshot ?? applyCustomization(item.product, item);
    for (const [ingredientId, quantity] of Object.entries(recipe)) {
      totals.set(ingredientId, (totals.get(ingredientId) ?? 0) + quantity * item.quantity);
    }
  }
  return Array.from(totals, ([ingredientId, quantity]) => ({ ingredientId, quantity }));
}

export function recipeCost(product: DbProduct, inventory: DbRawInventory[]): number {
  const costPerBaseUnit = new Map(inventory.map((item) => [item.id, item.stock > 0 ? item.cost / item.stock : 0]));
  return Math.round(Object.entries(product.recipe ?? {}).reduce(
    (total, [ingredientId, quantity]) => total + (costPerBaseUnit.get(ingredientId) ?? 0) * quantity,
    0,
  ) * 100) / 100;
}

export function applyPurchaseValue(input: { stock: number; totalCost: number; addedStock: number; addedCost: number }) {
  if (input.addedStock <= 0 || input.addedCost < 0) throw new AppError(400, 'INVALID_PURCHASE', 'La compra no es válida.');
  const stock = input.stock + input.addedStock;
  const totalCost = toMoney(input.totalCost + input.addedCost);
  return { stock, totalCost, averageUnitCost: stock > 0 ? totalCost / stock : 0 };
}

export function applyWasteValue(input: { stock: number; totalCost: number; quantity: number }) {
  if (input.quantity <= 0 || input.quantity > input.stock) throw new AppError(409, 'INSUFFICIENT_INVENTORY', 'No hay inventario suficiente.');
  const unitCost = input.stock > 0 ? input.totalCost / input.stock : 0;
  const costSnapshot = toMoney(unitCost * input.quantity);
  return { stock: input.stock - input.quantity, totalCost: Math.max(0, toMoney(input.totalCost - costSnapshot)), unitCost, costSnapshot };
}

function applyCustomization(product: DbProduct, item: PricedOrderItem): Record<string, number> {
  const recipe = { ...(product.recipe ?? {}) };
  const customization = item.customization;
  if (!customization) return recipe;

  const multiplier = customization.size === 'grande' ? 1.5 : 1;
  for (const ingredient of ['coffee_beans', 'matcha_powder']) {
    if (recipe[ingredient]) recipe[ingredient] *= multiplier;
  }
  if (recipe.milk_whole) {
    const amount = recipe.milk_whole * multiplier;
    delete recipe.milk_whole;
    const milkKey = {
      whole: 'milk_whole',
      light: 'milk_light',
      avena: 'milk_avena',
      almendra: 'milk_almendra',
      none: '',
    }[customization.milk];
    if (milkKey) recipe[milkKey] = amount;
  }
  if (customization.extraShot) recipe.coffee_beans = (recipe.coffee_beans ?? 0) + 18;
  return recipe;
}
