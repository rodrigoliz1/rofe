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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cash' | 'inventory' | 'closure'>('dashboard');
  const [metrics, setMetrics] = useState<Metrics>({
    revenue: 0, costs: 0, profit: 0, cashInRegister: 0, transactionsCount: 0,
  });
  const [adjustedRegister, setAdjustedRegister] = useState<Record<string, number>>({});
  const [dbInventory, setDbInventory] = useState<InventoryDbItem[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [, setOrders] = useState<Order[]>([]);
  const [bakeryBatches, setBakeryBatches] = useState<any[]>([]);

  // Form for manual transactions
  const [txType, setTxType] = useState<'manual_income' | 'manual_expense'>('manual_expense');
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
      const mRes = await fetch(getApiUrl('/api/admin/metrics'));
      if (mRes.ok) setMetrics(await mRes.json());

      const cRes = await fetch(getApiUrl('/api/admin/cash'));
      if (cRes.ok) setAdjustedRegister(await cRes.json());

      const iRes = await fetch(getApiUrl('/api/admin/inventory'));
      if (iRes.ok) setDbInventory(await iRes.json());

      const tRes = await fetch(getApiUrl('/api/admin/transactions'));
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
  }, [activeTab]);

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

  const handleUpdateProductStockCost = async (productId: string, newStock: number, newCost: number) => {
    try {
      const res = await fetch(getApiUrl('/api/admin/inventory'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          stock: newStock,
          cost: newCost,
        }),
      });
      if (res.ok) {
        loadAllData();
        onInventoryUpdate();
      } else {
        alert('Error al actualizar producto.');
      }
    } catch (e) {
      alert('Error de red.');
    }
  };

  const getProductStockAndCost = (id: string) => {
    const dbItem = dbInventory.find(i => i.product_id === id);
    return {
      stock: dbItem ? dbItem.stock : 0,
      cost: dbItem ? dbItem.cost : 0.00
    };
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

  const stockAlerts = products
    .filter(p => p.category !== 'bakery')
    .filter(p => getProductStockAndCost(p.id).stock < 30)
    .map(p => `Stock bajo de ${p.name}: ${getProductStockAndCost(p.id).stock} unidades.`);

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
          <button className={`admin-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
            Costos e Inventario
          </button>
          <button className={`admin-tab-btn ${activeTab === 'closure' ? 'active' : ''}`} onClick={() => setActiveTab('closure')}>
            Cierre de Caja
          </button>
          <button className="admin-exit-btn" onClick={onClose}>CERRAR PANEL</button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="admin-dashboard-container">
          <div className="metrics-row">
            <div className="metric-card card-revenue">
              <span className="metric-label">INGRESOS DE HOY</span>
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
                <Bar dataKey="valor" fill="#ea580c" radius={[4, 4, 0, 0]} />
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
                      EGRESO (Retiro/Insumos)
                    </button>
                    <button type="button" className={`type-select-btn income ${txType === 'manual_income' ? 'selected' : ''}`} onClick={() => setTxType('manual_income')}>
                      INGRESO (Manual)
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
                            <span className={`tx-badge ${tx.type.includes('income') || tx.type === 'payment' ? 'tx-badge-income' : 'tx-badge-expense'}`}>
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

      {activeTab === 'inventory' && (
        <div className="admin-inventory-container">
          <h3 className="section-subtitle">COSTOS E INVENTARIO DE PRODUCTOS</h3>
          <div className="inventory-table-wrapper">
            <table className="inventory-table-admin">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio Venta</th>
                  <th>Costo Preparación</th>
                  <th>Stock Actual</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const { stock, cost } = getProductStockAndCost(p.id);
                  return (
                    <tr key={p.id} className={stock === 0 ? 'stock-depleted-row' : ''}>
                      <td className="inventory-product-cell">
                        <span className="font-bold">{p.name}</span>
                        {stock === 0 && <span className="depleted-hint">AGOTADO</span>}
                      </td>
                      <td className="font-bold">${p.price.toFixed(2)} MXN</td>
                      <td>
                        <div className="cost-input-wrapper">
                          <span>$</span>
                          <input type="number" className="inventory-input-number" defaultValue={cost} onBlur={(e) => handleUpdateProductStockCost(p.id, stock, parseFloat(e.target.value))} />
                        </div>
                      </td>
                      <td>
                        <span className={`stock-level-badge ${stock <= 5 ? 'stock-critical' : 'stock-ok'}`}>{stock} unidades</span>
                      </td>
                      <td>
                        <div className="inventory-actions-cell">
                          <button className="stock-adjust-btn btn-stock-minus" onClick={() => handleUpdateProductStockCost(p.id, Math.max(0, stock - 1), cost)}>-1</button>
                          <button className="stock-adjust-btn btn-stock-plus" onClick={() => handleUpdateProductStockCost(p.id, stock + 1, cost)}>+1</button>
                          <button className="stock-adjust-btn btn-stock-plus" onClick={() => handleUpdateProductStockCost(p.id, stock + 10, cost)}>+10</button>
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
