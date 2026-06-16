import React, { useState, useEffect } from 'react';
import type { Product, Order } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface AdminViewProps {
  products: Product[];
  onClose: () => void;
  onInventoryUpdate: () => void;
}

interface Metrics {
  revenue: number;
  costs: number;
  profit: number;
  cashInRegister: number;
  transactionsCount: number;
}

interface RawInventoryItem {
  id: string;
  name: string;
  unit: string;
  stock: number;
  cost: number;
}

interface InventoryDbItem {
  product_id: string;
  stock: number;
  cost: number;
}

const DENOM_LABELS: Record<string, string> = {
  bill_1000: 'Billetes de $1000',
  bill_500: 'Billetes de $500',
  bill_200: 'Billetes de $200',
  bill_100: 'Billetes de $100',
  bill_50: 'Billetes de $50',
  bill_20: 'Billetes de $20',
  coin_20: 'Monedas de $20',
  coin_10: 'Monedas de $10',
  coin_5: 'Monedas de $5',
  coin_2: 'Monedas de $2',
  coin_1: 'Monedas de $1',
  coin_0_50: 'Monedas de 50¢',
  coin_0_20: 'Monedas de 20¢',
};

const DENOM_VALUES: Record<string, number> = {
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

export const AdminView: React.FC<AdminViewProps> = ({
  products,
  onClose,
  onInventoryUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cash' | 'costs' | 'raw_inventory' | 'closure'>('dashboard');
  const [metrics, setMetrics] = useState<Metrics>({
    revenue: 0, costs: 0, profit: 0, cashInRegister: 0, transactionsCount: 0,
  });
  const [adjustedRegister, setAdjustedRegister] = useState<Record<string, number>>({});
  const [dbInventory, setDbInventory] = useState<InventoryDbItem[]>([]);
  const [rawInventory, setRawInventory] = useState<RawInventoryItem[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [, setOrders] = useState<Order[]>([]);
  const [bakeryBatches, setBakeryBatches] = useState<any[]>([]);

  const [viewMode, setViewMode] = useState<'operativa' | 'inversion'>('operativa');
  const [datePreset, setDatePreset] = useState<'today' | 'this_month' | 'this_year' | 'custom'>('today');
  
  // Format YYYY-MM-DD
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Form for manual transactions
  const [txType, setTxType] = useState<'manual_income' | 'manual_expense' | 'manual_investment'>('manual_expense');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txError, setTxError] = useState('');
  const [txSuccess, setTxSuccess] = useState('');

  // Audit modal
  const [auditTx, setAuditTx] = useState<any>(null);
  const [auditAction, setAuditAction] = useState<'modify' | 'delete'>('delete');
  const [auditReason, setAuditReason] = useState('');
  const [auditNewAmount, setAuditNewAmount] = useState('');

  const getApiUrl = (path: string) => {
    const base = import.meta.env.VITE_API_URL || 
                 (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')
                   ? `http://${window.location.hostname}:3000`
                   : window.location.origin);
    return `${base}${path}`;
  };

  const loadAllData = async () => {
    try {
      let startDate = '';
      let endDate = '';
      const now = new Date();
      
      if (datePreset === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startDate = startOfDay.toISOString();
      } else if (datePreset === 'this_month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = startOfMonth.toISOString();
      } else if (datePreset === 'this_year') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        startDate = startOfYear.toISOString();
      } else if (datePreset === 'custom') {
        if (customStartDate) startDate = new Date(`${customStartDate}T00:00:00`).toISOString();
        if (customEndDate) endDate = new Date(`${customEndDate}T23:59:59`).toISOString();
      }

      const queryParams = new URLSearchParams({
        viewMode,
        ...(startDate && { startDate }),
        ...(endDate && { endDate })
      }).toString();

      const mRes = await fetch(getApiUrl(`/api/admin/metrics?${queryParams}`));
      if (mRes.ok) setMetrics(await mRes.json());

      const cRes = await fetch(getApiUrl('/api/admin/cash'));
      if (cRes.ok) setAdjustedRegister(await cRes.json());

      const iRes = await fetch(getApiUrl('/api/admin/inventory'));
      if (iRes.ok) setDbInventory(await iRes.json());

      const rRes = await fetch(getApiUrl('/api/admin/raw-inventory'));
      if (rRes.ok) setRawInventory(await rRes.json());

      const tRes = await fetch(getApiUrl(`/api/admin/transactions?${queryParams}`));
      if (tRes.ok) setTransactions(await tRes.json());

      const oRes = await fetch(getApiUrl('/api/orders'));
      if (oRes.ok) setOrders(await oRes.json());

      const bRes = await fetch(getApiUrl('/api/admin/bakery-batches'));
      if (bRes.ok) setBakeryBatches(await bRes.json());
    } catch (e) {
      console.error('Error loading admin data:', e);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [activeTab, viewMode, datePreset, customStartDate, customEndDate]);

  const handleAdjustDenom = (denom: string, val: number) => {
    setAdjustedRegister(prev => ({
      ...prev,
      [denom]: Math.max(0, (prev[denom] || 0) + val)
    }));
  };

  const handleSaveCashAdjustments = async () => {
    try {
      const res = await fetch(getApiUrl('/api/admin/cash/adjust'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denominations: adjustedRegister }),
      });
      if (res.ok) {
        alert('Arqueo de caja actualizado con éxito.');
        loadAllData();
      } else {
        alert('Error al actualizar la caja.');
      }
    } catch (e) {
      console.error(e);
      alert('Error de conexión.');
    }
  };

  const handleAddTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError('');
    setTxSuccess('');

    const parsedAmount = parseFloat(txAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setTxError('Por favor ingresa un monto válido.');
      return;
    }

    if (!txDescription.trim()) {
      setTxError('Por favor ingresa un concepto o descripción.');
      return;
    }

    try {
      const res = await fetch(getApiUrl('/api/admin/cash/transaction'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: txType,
          amount: parsedAmount,
          description: txDescription,
          denominations: {}, // Manual generic transaction does not strictly require denoms
        }),
      });

      if (res.ok) {
        setTxSuccess('Movimiento registrado con éxito.');
        setTxDescription('');
        setTxAmount('');
        loadAllData();
      } else {
        const err = await res.json();
        setTxError(err.error || 'Error al registrar movimiento.');
      }
    } catch (error) {
      setTxError('Error al conectar con el servidor.');
    }
  };

  const handleAuditSubmit = async () => {
    if (!auditReason.trim()) {
      alert('Debes ingresar una razón para la auditoría.');
      return;
    }

    const payload: any = {
      status: auditAction === 'delete' ? 'deleted' : 'modified',
      auditReason
    };

    if (auditAction === 'modify') {
      const parsedAmount = parseFloat(auditNewAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        alert('Ingresa un nuevo monto válido.');
        return;
      }
      payload.newAmount = parsedAmount;
    }

    try {
      const res = await fetch(getApiUrl(`/api/admin/transactions/${auditTx.id}/audit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setAuditTx(null);
        setAuditReason('');
        setAuditNewAmount('');
        loadAllData();
      } else {
        alert('Error al auditar.');
      }
    } catch (e) {
      alert('Error de conexión.');
    }
  };

  const handleUpdateProductPrice = async (productId: string, newPrice: number) => {
    try {
      const res = await fetch(getApiUrl('/api/products/price'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, price: newPrice }),
      });
      if (res.ok) {
        loadAllData();
        onInventoryUpdate();
      } else {
        alert('Error al actualizar precio.');
      }
    } catch (e) {
      alert('Error de red.');
    }
  };

  const handleUpdateRawInventory = async (id: string, newStock: number, newCost: number) => {
    try {
      const res = await fetch(getApiUrl('/api/admin/raw-inventory'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, stock: newStock, cost: newCost }),
      });
      if (res.ok) {
        loadAllData();
      } else {
        alert('Error al actualizar insumo.');
      }
    } catch (e) {
      alert('Error de red.');
    }
  };

  const calculateProductCost = (product: Product): number => {
    if (!product.recipe) return 0;
    let totalCost = 0;
    for (const [ingId, qty] of Object.entries(product.recipe)) {
      const raw = rawInventory.find(r => r.id === ingId);
      if (raw && raw.stock > 0) {
        const unitCost = raw.cost / raw.stock;
        totalCost += (unitCost * Number(qty));
      }
    }
    return totalCost;
  };

  // Build chart data
  const chartData = [
    { name: 'Ingresos', valor: metrics.revenue },
    { name: 'Costos', valor: metrics.costs },
    { name: 'Utilidades', valor: metrics.profit },
  ];

  // Closure Alerts
  const cashAlerts = [];
  if (metrics.cashInRegister < 1200) cashAlerts.push('El efectivo total en caja es menor a $1,200 MXN.');
  if ((adjustedRegister['bill_200'] || 0) < 3) cashAlerts.push('Pocos billetes de $200 (Menos de 3)');
  if ((adjustedRegister['bill_100'] || 0) < 4) cashAlerts.push('Pocos billetes de $100 (Menos de 4)');
  if ((adjustedRegister['bill_50'] || 0) < 7) cashAlerts.push('Pocos billetes de $50 (Menos de 7)');
  if ((adjustedRegister['coin_20'] || 0) < 10) cashAlerts.push('Pocas monedas de $20 (Menos de 10)');
  if ((adjustedRegister['coin_10'] || 0) < 15) cashAlerts.push('Pocas monedas de $10 (Menos de 15)');
  if ((adjustedRegister['coin_5'] || 0) < 30) cashAlerts.push('Pocas monedas de $5 (Menos de 30)');

  const stockAlerts = rawInventory
    .filter(item => item.stock < 100) // General low stock threshold
    .map(item => `Stock bajo de ${item.name}: ${item.stock} ${item.unit}.`);

  const bakeryExpirations = bakeryBatches.filter(b => {
    const expires = new Date(b.expires_at).getTime();
    const now = new Date().getTime();
    return expires < now || (expires - now) < (12 * 60 * 60 * 1000); // Expirado o a 12 horas de expirar
  });

  return (
    <div className="admin-view" style={{ overflowY: 'auto' }}>
      <div className="admin-header">
        <div className="admin-title-row">
          <h2 className="admin-title">PANEL DE ADMINISTRACIÓN</h2>
          <span className="motocarro-badge badge-admin">ADMINISTRADOR</span>
        </div>
        <div className="admin-nav">
          <button className={`admin-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            Dashboard y Métricas
          </button>
          <button className={`admin-tab-btn ${activeTab === 'cash' ? 'active' : ''}`} onClick={() => setActiveTab('cash')}>
            Arqueo de Caja ($)
          </button>
          <button className={`admin-tab-btn ${activeTab === 'costs' ? 'active' : ''}`} onClick={() => setActiveTab('costs')}>
            Costos y Precios
          </button>
          <button className={`admin-tab-btn ${activeTab === 'raw_inventory' ? 'active' : ''}`} onClick={() => setActiveTab('raw_inventory')}>
            Inventario Insumos
          </button>
          <button className={`admin-tab-btn ${activeTab === 'closure' ? 'active' : ''}`} onClick={() => setActiveTab('closure')}>
            Corte de Caja
          </button>
          <button className="admin-exit-btn" onClick={onClose}>CERRAR PANEL</button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="admin-dashboard-container">
          {/* CONTROL BAR: VIEW MODE & DATE RANGE */}
          <div className="dashboard-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1c1c1c', padding: '15px 20px', borderRadius: 12, marginBottom: 20 }}>
            <div className="view-mode-toggles" style={{ display: 'flex', gap: 10 }}>
              <button 
                className={`admin-tab-btn ${viewMode === 'operativa' ? 'active' : ''}`} 
                style={{ borderColor: viewMode === 'operativa' ? '#ea580c' : 'transparent', color: viewMode === 'operativa' ? '#ea580c' : '#888' }}
                onClick={() => setViewMode('operativa')}
              >
                📊 Vista Operativa
              </button>
              <button 
                className={`admin-tab-btn ${viewMode === 'inversion' ? 'active' : ''}`} 
                style={{ borderColor: viewMode === 'inversion' ? '#3b82f6' : 'transparent', color: viewMode === 'inversion' ? '#3b82f6' : '#888' }}
                onClick={() => setViewMode('inversion')}
              >
                🏢 Vista Inversión
              </button>
            </div>
            <div className="date-range-controls" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select className="admin-input-text" style={{ padding: '8px 12px', width: 'auto' }} value={datePreset} onChange={e => setDatePreset(e.target.value as any)}>
                <option value="today">Hoy</option>
                <option value="this_month">Este Mes</option>
                <option value="this_year">Este Año</option>
                <option value="custom">Personalizado...</option>
              </select>
              {datePreset === 'custom' && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <input type="date" className="admin-input-text" style={{ padding: '8px', width: 'auto' }} value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                  <span style={{ color: '#888' }}>a</span>
                  <input type="date" className="admin-input-text" style={{ padding: '8px', width: 'auto' }} value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          <div className="metrics-row">
            <div className="metric-card card-revenue">
              <span className="metric-label">INGRESOS</span>
              <span className="metric-value">${metrics.revenue.toFixed(2)} MXN</span>
            </div>
            <div className="metric-card card-costs">
              <span className="metric-label">COSTOS TOTALES</span>
              <span className="metric-value">${metrics.costs.toFixed(2)} MXN</span>
            </div>
            <div className="metric-card card-profit">
              <span className="metric-label">UTILIDADES NETAS</span>
              <span className="metric-value">${metrics.profit.toFixed(2)} MXN</span>
            </div>
            <div className="metric-card card-cash">
              <span className="metric-label">EFECTIVO EN CAJA</span>
              <span className="metric-value">${metrics.cashInRegister.toFixed(2)} MXN</span>
            </div>
          </div>

          <div className="charts-container" style={{ height: 300, background: '#1c1c1c', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h3 className="section-subtitle">RESUMEN VISUAL</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip cursor={{fill: '#2c2c2c'}} contentStyle={{ background: '#111', border: '1px solid #333' }} />
                <Bar dataKey="valor" fill={viewMode === 'inversion' ? '#3b82f6' : '#ea580c'} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="admin-dashboard-split">
            <div className="manual-tx-panel">
              <h3 className="section-subtitle">REGISTRAR MOVIMIENTO</h3>
              <form onSubmit={handleAddTransactionSubmit} className="admin-form">
                <div className="form-group-row">
                  <label className="form-label">Tipo de Movimiento:</label>
                  <div className="tx-type-selector">
                    <button type="button" className={`type-select-btn expense ${txType === 'manual_expense' ? 'selected' : ''}`} onClick={() => setTxType('manual_expense')}>
                      EGRESO (Op)
                    </button>
                    <button type="button" className={`type-select-btn income ${txType === 'manual_income' ? 'selected' : ''}`} onClick={() => setTxType('manual_income')}>
                      INGRESO (Op)
                    </button>
                    <button type="button" className={`type-select-btn investment ${txType === 'manual_investment' ? 'selected' : ''}`} style={{ borderColor: txType === 'manual_investment' ? '#3b82f6' : '#333', color: txType === 'manual_investment' ? '#3b82f6' : '#888' }} onClick={() => setTxType('manual_investment')}>
                      INVERSIÓN
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Concepto / Descripción:</label>
                  <input type="text" className="admin-input-text" placeholder="Ej. Compra de hielo, Inyección de cambio..." value={txDescription} onChange={(e) => setTxDescription(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label font-bold">Monto:</label>
                  <div className="cost-input-wrapper" style={{ width: '100%', maxWidth: 300 }}>
                    <span>$</span>
                    <input type="number" className="inventory-input-number" placeholder="0.00" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} />
                  </div>
                </div>
                {txError && <p className="admin-error-hint">{txError}</p>}
                {txSuccess && <p className="admin-success-hint">{txSuccess}</p>}
                <button type="submit" className="admin-submit-btn">REGISTRAR</button>
              </form>
            </div>

            <div className="ledger-panel">
              <h3 className="section-subtitle">HISTORIAL DE MOVIMIENTOS</h3>
              <div className="ledger-table-wrapper">
                {transactions.length === 0 ? <p className="no-transactions">No hay movimientos.</p> : (
                  <table className="ledger-table">
                    <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Auditoría</th></tr></thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id} style={{ opacity: tx.status === 'deleted' ? 0.5 : 1 }}>
                          <td>{new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td>
                            <span className={`tx-badge ${tx.type.includes('income') || tx.type === 'payment' ? 'tx-badge-income' : (tx.type === 'card_payment' ? 'tx-badge-card' : (tx.type === 'manual_investment' ? 'tx-badge-investment' : 'tx-badge-expense'))}`}
                                  style={{
                                    ...(tx.type === 'card_payment' ? { background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', borderColor: '#3b82f6' } : {}),
                                    ...(tx.type === 'manual_investment' ? { background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: '#2563eb' } : {})
                                  }}>
                              {tx.type}
                            </span>
                            <div className="tx-desc-hint" style={{ textDecoration: tx.status === 'deleted' ? 'line-through' : 'none' }}>
                              {tx.description}
                            </div>
                            {tx.status === 'deleted' && <span className="tx-audit-hint" style={{color: '#ff4d4f', fontSize: '0.8rem'}}>Borrado: {tx.audit_reason}</span>}
                            {tx.status === 'modified' && <span className="tx-audit-hint" style={{color: '#faad14', fontSize: '0.8rem'}}>Modificado (Original: ${tx.original_amount}): {tx.audit_reason}</span>}
                          </td>
                          <td className={`tx-amount-col ${tx.type.includes('income') || tx.type === 'payment' ? 'amount-plus' : 'amount-minus'}`} style={{ textDecoration: tx.status === 'deleted' ? 'line-through' : 'none' }}>
                            ${tx.amount.toFixed(2)}
                          </td>
                          <td>
                            {tx.status !== 'deleted' && (
                              <div style={{display: 'flex', gap: 5}}>
                                <button className="tx-audit-btn" onClick={() => { setAuditTx(tx); setAuditAction('modify'); }}>Modificar</button>
                                <button className="tx-audit-btn delete" onClick={() => { setAuditTx(tx); setAuditAction('delete'); }}>Borrar</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT MODAL */}
      {auditTx && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="product-modal-content" style={{ background: '#1a1a1a', padding: 30, borderRadius: 16 }}>
            <h3>Fe de Erratas: {auditAction === 'delete' ? 'Borrar Movimiento' : 'Modificar Movimiento'}</h3>
            <p style={{marginTop: 10, marginBottom: 20}}>Auditar transacción ID {auditTx.id} - {auditTx.description} (${auditTx.amount})</p>
            {auditAction === 'modify' && (
              <div className="form-group" style={{ marginTop: 15 }}>
                <label className="form-label">Nuevo Monto:</label>
                <div className="cost-input-wrapper">
                  <span>$</span>
                  <input type="number" className="inventory-input-number" value={auditNewAmount} onChange={e => setAuditNewAmount(e.target.value)} />
                </div>
              </div>
            )}
            <div className="form-group" style={{ marginTop: 15 }}>
              <label className="form-label">Razón del cambio (Obligatorio):</label>
              <input type="text" className="admin-input-text" value={auditReason} onChange={e => setAuditReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="admin-submit-btn" onClick={handleAuditSubmit}>Confirmar Auditoría</button>
              <button className="admin-exit-btn" onClick={() => setAuditTx(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cash' && (
        <div className="admin-cash-container">
          <h3 className="section-subtitle">ARQUEO DE CAJA DIARIO (FONDO DE CAJA)</h3>
          <p className="hint-text">Establece la cantidad exacta de billetes y monedas que tienes físicamente en la gaveta.</p>
          <div className="cash-adjust-sections">
            <div className="cash-adjust-column">
              <h4 className="column-subtitle">💵 BILLETES</h4>
              <div className="cash-adjust-list">
                {Object.keys(DENOM_LABELS).filter(k => k.includes('bill')).map(denom => {
                  const currentVal = (adjustedRegister[denom] || 0) * DENOM_VALUES[denom];
                  return (
                    <div key={denom} className="cash-adjust-row">
                      <span className="cash-adjust-label">{DENOM_LABELS[denom]}</span>
                      <div className="cash-adjust-controls">
                        <button className="cash-qty-btn" onClick={() => handleAdjustDenom(denom, -5)}>-5</button>
                        <button className="cash-qty-btn" onClick={() => handleAdjustDenom(denom, -1)}>-</button>
                        <span className="cash-qty-value">{adjustedRegister[denom] || 0}</span>
                        <button className="cash-qty-btn" onClick={() => handleAdjustDenom(denom, 1)}>+</button>
                        <button className="cash-qty-btn" onClick={() => handleAdjustDenom(denom, 5)}>+5</button>
                        <span className="cash-value-display">${currentVal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="cash-adjust-column">
              <h4 className="column-subtitle">🪙 MONEDAS</h4>
              <div className="cash-adjust-list">
                {Object.keys(DENOM_LABELS).filter(k => k.includes('coin')).map(denom => {
                  const currentVal = (adjustedRegister[denom] || 0) * DENOM_VALUES[denom];
                  return (
                    <div key={denom} className="cash-adjust-row">
                      <span className="cash-adjust-label">{DENOM_LABELS[denom]}</span>
                      <div className="cash-adjust-controls">
                        <button className="cash-qty-btn" onClick={() => handleAdjustDenom(denom, -5)}>-5</button>
                        <button className="cash-qty-btn" onClick={() => handleAdjustDenom(denom, -1)}>-</button>
                        <span className="cash-qty-value">{adjustedRegister[denom] || 0}</span>
                        <button className="cash-qty-btn" onClick={() => handleAdjustDenom(denom, 1)}>+</button>
                        <button className="cash-qty-btn" onClick={() => handleAdjustDenom(denom, 5)}>+5</button>
                        <span className="cash-value-display">${currentVal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="cash-adjust-footer">
            <div className="total-cash-calculated">
              <span>EFECTIVO TOTAL CALCULADO EN ARQUEO:</span>
              <h2>${Object.entries(adjustedRegister).reduce((sum, [d, qty]) => sum + (qty * (DENOM_VALUES[d] || 0)), 0).toFixed(2)} MXN</h2>
            </div>
            <button className="confirm-cash-adjust-btn" onClick={handleSaveCashAdjustments}>GUARDAR ARQUEO Y ACTUALIZAR CAJA</button>
          </div>
        </div>
      )}

      {activeTab === 'costs' && (
        <div className="admin-inventory-container">
          <h3 className="section-subtitle">COSTOS Y PRECIOS DE PRODUCTOS</h3>
          <div className="inventory-table-wrapper">
            <table className="inventory-table-admin">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Costo Preparación (Calculado)</th>
                  <th>Precio Venta</th>
                  <th>Utilidad Bruta</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const prepCost = calculateProductCost(p);
                  const grossProfit = p.price - prepCost;
                  return (
                    <tr key={p.id}>
                      <td className="inventory-product-cell font-bold">{p.name}</td>
                      <td>${prepCost.toFixed(2)} MXN</td>
                      <td>
                        <div className="cost-input-wrapper">
                          <span>$</span>
                          <input type="number" className="inventory-input-number" defaultValue={p.price} onBlur={(e) => handleUpdateProductPrice(p.id, parseFloat(e.target.value))} />
                        </div>
                      </td>
                      <td className="font-bold" style={{ color: grossProfit > 0 ? '#10b981' : '#ef4444' }}>
                        ${grossProfit.toFixed(2)} MXN
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'raw_inventory' && (
        <div className="admin-inventory-container">
          <h3 className="section-subtitle">INVENTARIO DE INSUMOS</h3>
          <div className="inventory-table-wrapper">
            <table className="inventory-table-admin">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Stock Actual</th>
                  <th>Costo Total de Stock</th>
                  <th>Costo Unitario</th>
                  <th>Acciones Stock</th>
                </tr>
              </thead>
              <tbody>
                {rawInventory.map((item) => {
                  const unitCost = item.stock > 0 ? (item.cost / item.stock) : 0;
                  return (
                    <tr key={item.id} className={item.stock === 0 ? 'stock-depleted-row' : ''}>
                      <td className="inventory-product-cell">
                        <span className="font-bold">{item.name}</span>
                      </td>
                      <td>
                        <div className="cost-input-wrapper">
                          <input type="number" className="inventory-input-number" defaultValue={item.stock} onBlur={(e) => handleUpdateRawInventory(item.id, parseFloat(e.target.value), item.cost)} />
                          <span>{item.unit}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cost-input-wrapper">
                          <span>$</span>
                          <input type="number" className="inventory-input-number" defaultValue={item.cost} onBlur={(e) => handleUpdateRawInventory(item.id, item.stock, parseFloat(e.target.value))} />
                        </div>
                      </td>
                      <td className="font-bold">${unitCost.toFixed(2)} MXN / {item.unit}</td>
                      <td>
                        <div className="inventory-actions-cell">
                          <button className="stock-adjust-btn btn-stock-minus" onClick={() => handleUpdateRawInventory(item.id, Math.max(0, item.stock - 10), item.cost)}>-10</button>
                          <button className="stock-adjust-btn btn-stock-plus" onClick={() => handleUpdateRawInventory(item.id, item.stock + 10, item.cost)}>+10</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'closure' && (
        <div className="admin-closure-container" style={{ padding: 20 }}>
          <h3 className="section-subtitle">CIERRE DE CAJA Y ALERTAS</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
            <div className="alert-panel" style={{ background: '#2c1e16', padding: 20, borderRadius: 12, border: '1px solid #ea580c' }}>
              <h4 style={{ color: '#ea580c', marginBottom: 10 }}>⚠️ Alertas de Flujo de Efectivo</h4>
              {cashAlerts.length === 0 ? <p style={{ color: '#888' }}>Caja saludable.</p> : (
                <ul style={{ paddingLeft: 20, color: '#ffbca3', lineHeight: 1.5 }}>
                  {cashAlerts.map((a, i) => <li key={i} style={{ marginBottom: 5 }}>{a}</li>)}
                </ul>
              )}
            </div>

            <div className="alert-panel" style={{ background: '#2a1a1e', padding: 20, borderRadius: 12, border: '1px solid #f43f5e' }}>
              <h4 style={{ color: '#f43f5e', marginBottom: 10 }}>🚨 Alertas de Inventario Crítico</h4>
              {stockAlerts.length === 0 ? <p style={{ color: '#888' }}>Inventario saludable.</p> : (
                <ul style={{ paddingLeft: 20, color: '#ffb2bd', lineHeight: 1.5 }}>
                  {stockAlerts.map((a, i) => <li key={i} style={{ marginBottom: 5 }}>{a}</li>)}
                </ul>
              )}
            </div>
          </div>

          <div className="bakery-tracking-panel" style={{ marginTop: 20, background: '#1c1c1c', padding: 20, borderRadius: 12 }}>
            <h4 style={{ marginBottom: 15 }}>🥐 Seguimiento de Panadería (Caducidad 48h)</h4>
            {bakeryExpirations.length > 0 && (
              <div style={{ padding: 15, background: '#3b1c1c', borderRadius: 8, color: '#ff8888', marginBottom: 15 }}>
                <strong>¡Atención!</strong> Hay lotes de panadería expirados o a punto de expirar en las próximas 12h.
              </div>
            )}
            <table className="ledger-table">
              <thead><tr><th>Lote ID</th><th>Producto</th><th>Cantidad Añadida</th><th>Fecha Añadido</th><th>Expiración</th></tr></thead>
              <tbody>
                {bakeryBatches.map(b => {
                  const pName = products.find(p => p.id === b.product_id)?.name || b.product_id;
                  const isExpired = new Date(b.expires_at).getTime() < new Date().getTime();
                  return (
                    <tr key={b.id}>
                      <td>#{b.id}</td>
                      <td>{pName}</td>
                      <td>{b.quantity}</td>
                      <td>{new Date(b.added_at).toLocaleString()}</td>
                      <td style={{ color: isExpired ? '#ff4d4f' : '#fff' }}>{new Date(b.expires_at).toLocaleString()} {isExpired && '(EXPIRADO)'}</td>
                    </tr>
                  )
                })}
                {bakeryBatches.length === 0 && <tr><td colSpan={5} style={{textAlign: 'center'}}>No hay lotes registrados.</td></tr>}
              </tbody>
            </table>
            
            <div style={{ marginTop: 25 }}>
              <h5 style={{ marginBottom: 10 }}>Añadir nuevo lote de panadería</h5>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select id="newBakeryProduct" className="admin-input-text" style={{width: 200}}>
                  {products.filter(p => p.category === 'bakery').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" id="newBakeryQty" className="admin-input-text" placeholder="Cantidad" style={{width: 100}} />
                <button className="admin-submit-btn" style={{ padding: '10px 20px', width: 'auto' }} onClick={async () => {
                  const productSelect = document.getElementById('newBakeryProduct') as HTMLSelectElement;
                  const qtyInput = document.getElementById('newBakeryQty') as HTMLInputElement;
                  if (!productSelect || !qtyInput || !qtyInput.value) return;
                  const res = await fetch(getApiUrl('/api/admin/bakery-batches'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId: productSelect.value, quantity: parseInt(qtyInput.value) })
                  });
                  if(res.ok) { qtyInput.value = ''; loadAllData(); onInventoryUpdate(); }
                }}>Registrar Lote</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
