import type { CartItem } from '../types';

export function cartTotal(items: CartItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.totalPrice, 0) * 100) / 100;
}

export function toOrderItemInputs(items: CartItem[]) {
  return items.map((item) => ({
    productId: item.product.id,
    quantity: item.quantity,
    customization: item.customization,
    selectedCustomVariants: item.selectedCustomVariants,
  }));
}

/** Full, sorted selections avoid collisions and support non-Latin option names. */
export function configuredItemId(productId: string, customization: CartItem['customization'], variants: Record<string, string> = {}): string {
  return JSON.stringify([productId, Object.entries(customization).sort(([a], [b]) => a.localeCompare(b)), Object.entries(variants).sort(([a], [b]) => a.localeCompare(b))]);
}
