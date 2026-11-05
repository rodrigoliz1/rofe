export const DENOM_VALUES: Record<string, number> = {
  bill_1000: 1000, bill_500: 500, bill_200: 200, bill_100: 100, bill_50: 50, bill_20: 20,
  coin_20: 20, coin_10: 10, coin_5: 5, coin_2: 2, coin_1: 1, coin_0_50: 0.5, coin_0_20: 0.2,
};
export function calculateOptimalChange(changeDue: number, availableCoins: Record<string, number>): { success: boolean; changeBreakdown: Record<string, number>; error?: string } {
  if (changeDue <= 0) return { success: true, changeBreakdown: {} };
  const target = Math.round(changeDue * 100);
  const coins = Object.entries(DENOM_VALUES).map(([key, value]) => ({ key, value: Math.round(value * 100), count: Math.max(0, Math.trunc(availableCoins[key] || 0)) })).filter((coin) => coin.count > 0);
  const capacity = coins.map((_, index) => coins.slice(index).reduce((sum, coin) => sum + coin.value * coin.count, 0));
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisors = coins.map((_, index) => coins.slice(index).reduce((value, coin) => gcd(value, coin.value), 0));
  const memo = new Set<string>();
  const search = (index: number, remaining: number): Record<string, number> | null => {
    if (remaining === 0) return {};
    if (index >= coins.length || remaining > capacity[index] || remaining % divisors[index] !== 0) return null;
    const state = `${index}:${remaining}`;
    if (memo.has(state)) return null;
    const coin = coins[index];
    for (let count = Math.min(coin.count, Math.floor(remaining / coin.value)); count >= 0; count -= 1) {
      const result = search(index + 1, remaining - count * coin.value);
      if (result) return count > 0 ? { [coin.key]: count, ...result } : result;
    }
    memo.add(state); return null;
  };
  const result = search(0, target);
  return result ? { success: true, changeBreakdown: result } : { success: false, changeBreakdown: {}, error: 'No hay una combinación exacta de cambio. Solicita otras denominaciones.' };
}

/**
 * Largest change that can actually be given with the drawer's denominations, never more
 * than `changeDue`. Used when exact change is impossible: the rest becomes a change voucher.
 * Bounded knapsack over cents, O(denominations × amount).
 */
export function calculateBestPossibleChange(changeDue: number, availableCoins: Record<string, number>): { amount: number; changeBreakdown: Record<string, number> } {
  const target = Math.round(Math.max(0, changeDue) * 100);
  if (target === 0) return { amount: 0, changeBreakdown: {} };
  const coins = Object.entries(DENOM_VALUES).map(([key, value]) => ({ key, value: Math.round(value * 100), count: Math.max(0, Math.trunc(availableCoins[key] || 0)) })).filter((coin) => coin.count > 0);
  // reach[s] = index of the coin used last to reach s (-1 = start, -2 = unreachable)
  const reach = new Int16Array(target + 1).fill(-2);
  const used = new Int32Array(target + 1);
  reach[0] = -1;
  coins.forEach((coin, coinIndex) => {
    used.fill(0);
    for (let sum = coin.value; sum <= target; sum += 1) {
      if (reach[sum] === -2 && reach[sum - coin.value] !== -2 && used[sum - coin.value] < coin.count) {
        reach[sum] = coinIndex;
        used[sum] = used[sum - coin.value] + 1;
      }
    }
  });
  let best = target;
  while (best > 0 && reach[best] === -2) best -= 1;
  const changeBreakdown: Record<string, number> = {};
  for (let sum = best; sum > 0;) {
    const coin = coins[reach[sum]];
    changeBreakdown[coin.key] = (changeBreakdown[coin.key] ?? 0) + 1;
    sum -= coin.value;
  }
  return { amount: best / 100, changeBreakdown };
}
