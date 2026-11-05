import { describe, expect, it } from 'vitest';
import { calculateOptimalChange } from './cash';
describe('exact cash change', () => {
  it('finds a valid bounded combination when greedy change would fail', () => {
    expect(calculateOptimalChange(6, { coin_5: 1, coin_2: 3 })).toEqual({ success: true, changeBreakdown: { coin_2: 3 } });
  });
  it('uses integer cents and refuses an inexact change', () => {
    expect(calculateOptimalChange(0.6, { coin_0_50: 1, coin_0_20: 3 })).toEqual({ success: true, changeBreakdown: { coin_0_20: 3 } });
    expect(calculateOptimalChange(0.55, { coin_0_50: 3, coin_0_20: 3 }).success).toBe(false);
  });
});

describe('best possible change', () => {
  it('gives the most change the drawer can and leaves the rest for a voucher', async () => {
    const { calculateBestPossibleChange } = await import('./cash');
    // $65 due, drawer has one $20 bill and two $10 coins → $40 in cash.
    const result = calculateBestPossibleChange(65, { bill_20: 1, coin_10: 2 });
    expect(result.amount).toBe(40);
    expect(result.changeBreakdown).toEqual({ bill_20: 1, coin_10: 2 });
  });
  it('is exact when exact change exists and never exceeds what is due', async () => {
    const { calculateBestPossibleChange } = await import('./cash');
    expect(calculateBestPossibleChange(35, { bill_20: 2, coin_10: 1, coin_5: 1 }).amount).toBe(35);
    expect(calculateBestPossibleChange(3, { coin_5: 4 }).amount).toBe(0);
    expect(calculateBestPossibleChange(0.7, { coin_0_50: 1, coin_0_20: 1 }).amount).toBe(0.7);
  });
  it('respects the number of pieces available for each denomination', async () => {
    const { calculateBestPossibleChange } = await import('./cash');
    const result = calculateBestPossibleChange(30, { coin_10: 2, coin_1: 3 });
    expect(result.amount).toBe(23);
    expect(result.changeBreakdown).toEqual({ coin_10: 2, coin_1: 3 });
  });
});
