import { AppError } from '../utils/errors';
import { toMoney } from './pricing';

export const DENOMINATION_VALUES: Record<string, number> = {
  bill_1000: 1000,
  bill_500: 500,
  bill_200: 200,
  bill_100: 100,
  bill_50: 50,
  bill_20: 20,
  coin_20: 20,
  coin_10: 10,
  coin_5: 5,
  coin_2: 2,
  coin_1: 1,
  coin_0_50: 0.5,
  coin_0_20: 0.2,
};

export function totalDenominations(denominations: Record<string, number>): number {
  let total = 0;
  for (const [key, count] of Object.entries(denominations)) {
    if (!(key in DENOMINATION_VALUES) || !Number.isInteger(count) || count < 0) {
      throw new AppError(400, 'INVALID_DENOMINATIONS', 'El conteo de efectivo no es válido.');
    }
    total += DENOMINATION_VALUES[key] * count;
  }
  return toMoney(total);
}

export function calculateCashDifference(expected: number, counted: number): number {
  return toMoney(counted - expected);
}
