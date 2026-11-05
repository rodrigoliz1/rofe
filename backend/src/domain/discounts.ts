import { AppError } from '../utils/errors';
import { toMoney, type PriceResult } from './pricing';

export type DiscountType = 'PERCENTAGE' | 'FIXED' | 'COURTESY';

export interface AuthorizedDiscount {
  type: DiscountType;
  value: number;
  reason: string;
  authorizedBy: string;
}

export interface DiscountedPriceResult extends PriceResult {
  discountAuthorization?: AuthorizedDiscount;
}

export function applyAuthorizedDiscount(pricing: PriceResult, authorization?: AuthorizedDiscount): DiscountedPriceResult {
  if (!authorization) return pricing;
  if (!authorization.reason.trim()) throw new AppError(400, 'DISCOUNT_REASON_REQUIRED', 'Indica la razón del descuento.');

  let rawDiscount: number;
  if (authorization.type === 'PERCENTAGE') {
    if (authorization.value <= 0 || authorization.value > 100) throw new AppError(400, 'INVALID_DISCOUNT', 'El porcentaje debe estar entre 0 y 100.');
    rawDiscount = pricing.subtotal * authorization.value / 100;
  } else if (authorization.type === 'FIXED') {
    if (authorization.value <= 0) throw new AppError(400, 'INVALID_DISCOUNT', 'El descuento debe ser mayor a cero.');
    rawDiscount = authorization.value;
  } else {
    rawDiscount = pricing.subtotal;
  }

  const discount = Math.min(pricing.subtotal, toMoney(rawDiscount));
  return {
    ...pricing,
    discount,
    total: toMoney(pricing.subtotal - discount + pricing.tax),
    discountAuthorization: authorization,
  };
}
