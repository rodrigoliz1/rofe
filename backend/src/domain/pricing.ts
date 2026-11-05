import type { DbProduct } from '../db';
import type { OrderItemInput } from './orders';
import { AppError } from '../utils/errors';

export interface PricedOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  customization?: OrderItemInput['customization'];
  selectedCustomVariants?: Record<string, string>;
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

const GRANDE_PRICE = 12;
const PLANT_MILK_PRICE = 15;
const EXTRA_SHOT_PRICE = 15;

export function priceOrder(products: DbProduct[], requestedItems: OrderItemInput[]): PriceResult {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const items = requestedItems.map((requested, index) => {
    const product = productMap.get(requested.productId);
    if (!product) throw new AppError(400, 'PRODUCT_NOT_AVAILABLE', `El producto ${requested.productId} no está disponible.`);

    let unitPrice = toMoney(product.price);
    const modifiers: PricedOrderItem['modifiers'] = [];
    const customization = requested.customization;

    if (customization?.size === 'grande') {
      unitPrice += GRANDE_PRICE;
      modifiers.push({ name: 'Tamaño grande', amount: GRANDE_PRICE });
    }
    if (customization?.milk === 'avena' || customization?.milk === 'almendra') {
      unitPrice += PLANT_MILK_PRICE;
      modifiers.push({ name: `Leche de ${customization.milk}`, amount: PLANT_MILK_PRICE });
    }
    if (customization?.extraShot) {
      unitPrice += EXTRA_SHOT_PRICE;
      modifiers.push({ name: 'Shot extra', amount: EXTRA_SHOT_PRICE });
    }

    const selections = requested.selectedCustomVariants ?? {};
    for (const [groupTitle, optionName] of Object.entries(selections)) {
      const group = product.custom_variants?.find((candidate) => candidate.title === groupTitle);
      const option = group?.options.find((candidate) => candidate.name === optionName);
      if (!group || !option) {
        throw new AppError(400, 'INVALID_MODIFIER', `La opción ${optionName} ya no está disponible.`);
      }
      const amount = toMoney(option.priceModifier);
      unitPrice += amount;
      modifiers.push({ name: `${groupTitle}: ${option.name}`, amount });
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
      modifiers,
      notes: requested.notes,
    };
  });

  const subtotal = toMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
  return { items, subtotal, discount: 0, tax: 0, total: subtotal };
}

export function toMoney(value: number): number {
  if (!Number.isFinite(value)) throw new AppError(400, 'INVALID_AMOUNT', 'El importe no es válido.');
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
