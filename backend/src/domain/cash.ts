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

/**
 * Largest change the drawer can give, never more than `changeDue` (bounded knapsack over
 * cents). The backend uses it to accept a change voucher only for the amount that truly
 * cannot be given in cash — independent of what the barista's screen calculated.
 */
export function bestPossibleChange(changeDue: number, available: Record<string, number>): number {
  const target = Math.round(Math.max(0, changeDue) * 100);
  if (target === 0) return 0;
  const reachable = new Uint8Array(target + 1);
  reachable[0] = 1;
  const used = new Int32Array(target + 1);
  for (const [key, value] of Object.entries(DENOMINATION_VALUES)) {
    const cents = Math.round(value * 100);
    const count = Math.max(0, Math.trunc(available[key] || 0));
    if (count === 0) continue;
    used.fill(0);
    for (let sum = cents; sum <= target; sum += 1) {
      if (!reachable[sum] && reachable[sum - cents] && used[sum - cents] < count) {
        reachable[sum] = 1;
        used[sum] = used[sum - cents] + 1;
      }
    }
  }
  let best = target;
  while (best > 0 && !reachable[best]) best -= 1;
  return best / 100;
}

/** Money values must be whole cents. */
export const isWholeCents = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
