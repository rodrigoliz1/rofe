import { useCallback, useEffect, useState } from 'react';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { apiFetch, publicError } from '../services/api';

interface Report {
  revenue: number; grossSales: number; refunds: number; discounts: number; tickets: number; averageTicket: number; cashSales: number; cardSales: number;
  costOfGoodsSold: number; grossMargin: number; grossMarginPercent: number; operatingExpenses: number;
  otherIncome: number; wasteCost: number; purchaseSpend: number; operatingResult: number;
  products: Array<{ product: string; category: string; quantity: number; revenue: number }>;
  byHour: Array<{ hour: number; tickets: number; revenue: number }>;
}

const money = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export function ReportsPanel() {
  const actions = useAsyncAction();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
  const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  const queryForDates = useCallback(() => {
    const start = new Date(`${startDate}T00:00:00`); const end = new Date(`${endDate}T23:59:59.999`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new Error('Selecciona un periodo válido: la fecha inicial debe ser anterior a la final.');
    return new URLSearchParams({ startDate: start.toISOString(), endDate: end.toISOString() });
  }, [endDate, startDate]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const load = async () => {
      try {
        const response = await apiFetch(`/api/admin/reports/summary?${queryForDates()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(await publicError(response));
        const result = await response.json() as Report;
        if (!controller.signal.aborted) setReport(result);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No pudimos crear el reporte.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load(); return () => controller.abort();
  }, [queryForDates]);
  const downloadCsv = async () => {
    const response = await apiFetch(`/api/admin/reports/sales.csv?${queryForDates()}`);
    if (!response.ok) throw new Error(await publicError(response));
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `rofe-ventas-${startDate}-${endDate}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="reports-panel">
      <header><div><h3>REPORTES OPERATIVOS</h3><p>Ventas cobradas, costo real consumido, merma y resultado; las pérdidas permanecen visibles.</p></div><div className="report-actions"><label>Desde<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Hasta<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><button type="button" disabled={actions.busy || loading || Boolean(error)} onClick={() => void actions.run(downloadCsv)}>Exportar CSV</button></div></header>
      {(error || actions.error) && <div className="inline-feedback error" role="alert">{error || actions.error}</div>}
      {loading && <p className="empty-note" role="status">Preparando reporte…</p>}
      {report && !error && !loading && <>
        <div className="report-kpis">
          <article><span>Ventas netas</span><strong>{money(report.revenue)}</strong><small>{report.tickets} tickets · bruto {money(report.grossSales)}</small></article>
          <article><span>Margen bruto</span><strong>{money(report.grossMargin)}</strong><small>{report.grossMarginPercent.toFixed(1)}% · Costo de venta {money(report.costOfGoodsSold)}</small></article>
          <article className={report.operatingResult < 0 ? 'negative' : ''}><span>Resultado operativo</span><strong>{money(report.operatingResult)}</strong><small>Gastos {money(report.operatingExpenses)} · merma {money(report.wasteCost)}</small></article>
          <article><span>Devoluciones y descuentos</span><strong>{money(report.refunds + report.discounts)}</strong><small>Devoluciones {money(report.refunds)} · descuentos {money(report.discounts)}</small></article>
          <article><span>Flujo de compras</span><strong>{money(report.purchaseSpend)}</strong><small>Efectivo {money(report.cashSales)} · tarjeta {money(report.cardSales)}</small></article>
        </div>
        <div className="report-tables">
          <section><h4>Productos</h4><div className="report-table"><div className="report-row head"><span>Producto</span><span>Unidades</span><span>Venta</span></div>{report.products.map((row) => <div className="report-row" key={row.product}><span>{row.product}<small>{row.category}</small></span><span>{row.quantity}</span><strong>{money(row.revenue)}</strong></div>)}{report.products.length === 0 && <p className="empty-note">Sin ventas en el periodo.</p>}</div></section>
          <section><h4>Horas activas</h4><div className="report-table"><div className="report-row head"><span>Hora</span><span>Tickets</span><span>Venta</span></div>{report.byHour.map((row) => <div className="report-row" key={row.hour}><span>{String(row.hour).padStart(2, '0')}:00</span><span>{row.tickets}</span><strong>{money(row.revenue)}</strong></div>)}{report.byHour.length === 0 && <p className="empty-note">Sin actividad en el periodo.</p>}</div></section>
        </div>
      </>}
    </section>
  );
}
