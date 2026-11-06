import type { DbCashTransaction, DbInventoryMovement, DbOrder, DbPurchase, DbWasteRecord } from '../db';
import { toMoney } from '../domain/pricing';

interface ReportInput {
  orders: DbOrder[];
  transactions: DbCashTransaction[];
  movements: DbInventoryMovement[];
  purchases: DbPurchase[];
  waste: DbWasteRecord[];
  cashSessionId?: string;
  start?: number;
  end?: number;
}

const paymentDate = (order: DbOrder) => order.paidAt ?? order.inventoryAppliedAt ?? order.createdAt;
const refundDate = (order: DbOrder) => order.refundedAt ?? order.updatedAt;
const paidStatuses = new Set(['PAID', 'IN_PREPARATION', 'READY', 'COMPLETED', 'paid', 'preparing', 'ready', 'completed']);
const inRange = (timestamp: string | undefined, start?: number, end?: number) => {
  if (!timestamp) return false;
  const time = new Date(timestamp).getTime();
  return Number.isFinite(time) && (start === undefined || time >= start) && (end === undefined || time <= end);
};

export function buildOperationalReport(input: ReportInput) {
  const allPaidOrders = input.orders.filter((order) => (paidStatuses.has(order.status) || order.status === 'REFUNDED' || order.paymentStatus === 'REFUNDED') && (input.cashSessionId && order.paidCashSessionId ? order.paidCashSessionId === input.cashSessionId : inRange(paymentDate(order), input.start, input.end)));
  const refundedOrders = input.orders.filter(order => (order.status === 'REFUNDED' || order.paymentStatus === 'REFUNDED') && inRange(refundDate(order), input.start, input.end));
  const orders = allPaidOrders;
  const transactions = input.transactions.filter((entry) => entry.status !== 'deleted' && inRange(entry.created_at, input.start, input.end));
  const movements = input.movements.filter((entry) => inRange(entry.createdAt, input.start, input.end));
  const purchases = input.purchases.filter((entry) => inRange(entry.purchasedAt, input.start, input.end));
  const waste = input.waste.filter((entry) => inRange(entry.createdAt, input.start, input.end));
  const byProduct = new Map<string, { product: string; category: string; quantity: number; revenue: number }>();
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, tickets: 0, revenue: 0 }));
  let cashSales = 0;
  let cardSales = 0;
  // Change vouchers settle a liability: that part of the revenue was collected earlier in cash.
  let voucherSettled = 0;

  for (const order of orders) {
    const voucherPart = Number(order.voucherAmount || 0);
    voucherSettled += voucherPart;
    if (order.paymentMethod === 'cash') cashSales += order.total - voucherPart;
    else cardSales += order.total - voucherPart;
    const hour = new Date(paymentDate(order)).getHours();
    byHour[hour].tickets += 1;
    byHour[hour].revenue = toMoney(byHour[hour].revenue + order.total);
    for (const item of order.items) {
      const product = item.productName || item.product?.name || item.productId || 'Producto';
      const category = item.product?.category || 'sin-categoría';
      const current = byProduct.get(product) || { product, category, quantity: 0, revenue: 0 };
      current.quantity += Number(item.quantity || 0);
      current.revenue = toMoney(current.revenue + Number(item.subtotal ?? item.totalPrice ?? 0));
      byProduct.set(product, current);
    }
  }

  for (const order of refundedOrders) {
    if (order.paymentMethod === 'cash') cashSales -= order.total - Number(order.voucherAmount || 0);
    else cardSales -= order.total - Number(order.voucherAmount || 0);
    voucherSettled -= Number(order.voucherAmount || 0);
  }
  const grossSales = toMoney(allPaidOrders.reduce((sum, order) => sum + order.total, 0));
  const refunds = toMoney(refundedOrders.reduce((sum, order) => sum + order.total, 0));
  const discounts = toMoney(allPaidOrders.reduce((sum, order) => sum + Number(order.discount || 0), 0));
  const revenue = toMoney(grossSales - refunds);
  const saleCost = movements.filter((entry) => entry.movementType === 'SALE').reduce((sum, entry) => sum + Math.abs(entry.quantity) * entry.unitCostSnapshot, 0);
  const returnedCost = movements.filter((entry) => entry.movementType === 'RETURN').reduce((sum, entry) => sum + Math.abs(entry.quantity) * entry.unitCostSnapshot, 0);
  const costOfGoodsSold = toMoney(saleCost - returnedCost);
  const wasteCost = toMoney(waste.reduce((sum, entry) => sum + entry.costSnapshot, 0));
  const operatingExpenses = toMoney(transactions.filter((entry) => entry.type === 'manual_expense' && !entry.description.startsWith('Compra ')).reduce((sum, entry) => sum + entry.amount, 0));
  const otherIncome = toMoney(transactions.filter((entry) => entry.type === 'manual_income').reduce((sum, entry) => sum + entry.amount, 0));
  const purchaseSpend = toMoney(purchases.reduce((sum, purchase) => sum + purchase.total, 0));
  const grossMargin = toMoney(revenue - costOfGoodsSold);
  const operatingResult = toMoney(grossMargin + otherIncome - operatingExpenses - wasteCost);
  const products = Array.from(byProduct.values()).sort((left, right) => right.revenue - left.revenue);
  const categories = Array.from(products.reduce((map, row) => {
    const current = map.get(row.category) || { category: row.category, quantity: 0, revenue: 0 };
    current.quantity += row.quantity;
    current.revenue = toMoney(current.revenue + row.revenue);
    map.set(row.category, current);
    return map;
  }, new Map<string, { category: string; quantity: number; revenue: number }>()).values());

  return {
    revenue,
    // Legacy rows are estimated in historical reports only; no history is rewritten.
    estimatedPaymentDates: allPaidOrders.filter(order => !order.paidAt && !order.inventoryAppliedAt).length,
    grossSales,
    refunds,
    discounts,
    tickets: allPaidOrders.length,
    averageTicket: allPaidOrders.length ? toMoney(grossSales / allPaidOrders.length) : 0,
    cashSales: toMoney(cashSales),
    /** Part of the revenue settled with change vouchers (cash already collected when the voucher was issued). */
    voucherSettled: toMoney(voucherSettled),
    cardSales: toMoney(cardSales),
    costOfGoodsSold,
    grossMargin,
    grossMarginPercent: revenue ? toMoney((grossMargin / revenue) * 100) : 0,
    operatingExpenses,
    otherIncome,
    wasteCost,
    purchaseSpend,
    operatingResult,
    products,
    categories,
    byHour: byHour.filter((row) => row.tickets > 0),
  };
}

export function salesCsv(orders: DbOrder[]): string {
  const rows = [['folio', 'fecha', 'cliente', 'método', 'estado', 'total']];
  for (const order of orders.filter((entry) => paidStatuses.has(entry.status))) {
    rows.push([order.folio || order.id, paymentDate(order), order.customerName, order.paymentMethod, order.status, order.total.toFixed(2)]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
