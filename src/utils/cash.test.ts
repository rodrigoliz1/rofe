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
