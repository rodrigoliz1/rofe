import { toMoney } from './pricing';

export interface OperatingResultInput {
  revenue: number;
  costOfGoodsSold: number;
  operatingExpenses: number;
}

export function calculateOperatingResult(input: OperatingResultInput) {
  const grossMargin = toMoney(input.revenue - input.costOfGoodsSold);
  return {
    grossMargin,
    operatingProfit: toMoney(grossMargin - input.operatingExpenses),
  };
}
