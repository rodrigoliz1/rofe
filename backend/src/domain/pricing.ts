import type { DbProduct, DbRawInventory } from '../db';
import type { OrderItemInput } from './orders';
import { AppError } from '../utils/errors';
import { resolveModifiers, validateModifierConfiguration } from './modifiers';

export interface PricedOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  customization?: OrderItemInput['customization'];
  selectedCustomVariants?: Record<string, string>;
  quantitySelections?: Record<string, number>;
  recipeSnapshot?: Record<string, number>;
  recipeCostSnapshot?: number;
  preparation?: string[];
  ingredientInstructions?: string[];
  modifiers: Array<{ name: string; amount: number }>;
  notes?: string;
  product: DbProduct;
  totalPrice: number;
}

export interface PriceResult {
  items: PricedOrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function priceOrder(products: DbProduct[], requestedItems: OrderItemInput[], inventory?: DbRawInventory[]): PriceResult {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const items = requestedItems.map((requested, index) => {
    const product = productMap.get(requested.productId);
    if (!product) throw new AppError(400, 'PRODUCT_NOT_AVAILABLE', `El producto ${requested.productId} no está disponible.`);

    if (inventory && !Object.values(product.recipe ?? {}).some(amount => amount > 0)) throw new AppError(409, 'RECIPE_NOT_CONFIGURED', 'La receta de este producto está pendiente de configuración en Administración.');
    if (inventory) validateModifierConfiguration(product, inventory, true);
    let unitPrice = toMoney(product.price);
    const customization = requested.customization;
    if (customization && (customization.size !== 'regular' || !['none', 'whole'].includes(customization.milk) || customization.extraShot || customization.sweetness !== 'none' || (customization.temp === 'iced' && product.category !== 'cold') || (customization.milk === 'whole' && !product.recipe?.milk_whole))) {
      throw new AppError(400, 'INVALID_MODIFIER', 'Actualiza el menú y elige las opciones configuradas por Administración.');
    }
    const selections = requested.selectedCustomVariants ?? {};
    const resolved = resolveModifiers(product, selections, requested.quantitySelections ?? {}, inventory);
    const modifiers = resolved.modifiers;
    unitPrice += modifiers.reduce((total, modifier) => total + modifier.amount, 0);
    if (inventory) for (const [id, amount] of Object.entries(resolved.recipe)) {
      const ingredient = inventory.find(i => i.id === id);
      if (!ingredient || ingredient.stock - (ingredient.reservedStock ?? 0) < amount * requested.quantity) throw new AppError(409, 'INSUFFICIENT_INVENTORY', 'No hay ingredientes suficientes para esta personalización. Ajusta el pedido.');
    }
    unitPrice = toMoney(unitPrice);
    const subtotal = toMoney(unitPrice * requested.quantity);
    return {
      id: `${index + 1}`,
      productId: product.id,
      productName: product.name,
      product: { ...product, price: toMoney(product.price) },
      quantity: requested.quantity,
      unitPrice,
      subtotal,
      totalPrice: subtotal,
      customization,
      selectedCustomVariants: selections,
      quantitySelections: requested.quantitySelections,
      recipeSnapshot: resolved.recipe,
      recipeCostSnapshot: toMoney(resolved.unitCost),
      preparation: resolved.preparation,
      ingredientInstructions: resolved.ingredientLabels,
      modifiers,
      notes: requested.notes,
    };
  });

  if (inventory) {
    const totals = new Map<string, number>();
    for (const item of items) for (const [id, amount] of Object.entries(item.recipeSnapshot ?? {})) totals.set(id, (totals.get(id) ?? 0) + amount * item.quantity);
    for (const [id, amount] of totals) { const ingredient = inventory.find(i => i.id === id); if (!ingredient || ingredient.stock - (ingredient.reservedStock ?? 0) < amount) throw new AppError(409, 'INSUFFICIENT_INVENTORY', 'No hay ingredientes suficientes para este pedido. Reduce las cantidades.'); }
  }
  const subtotal = toMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
  return { items, subtotal, discount: 0, tax: 0, total: subtotal };
}

export function toMoney(value: number): number {
  if (!Number.isFinite(value)) throw new AppError(400, 'INVALID_AMOUNT', 'El importe no es válido.');
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
