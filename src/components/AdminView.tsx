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
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null | 'new'>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    revenue: 0, costs: 0, profit: 0, cashInRegister: 0, transactionsCount: 0,
  });
  const [adjustedRegister, setAdjustedRegister] = useState<Record<string, number>>({});
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

  // Modals state
  const [editingRecipeProduct, setEditingRecipeProduct] = useState<Product | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Record<string, number>>({});
  
  
  const [showRawItemDetailModal, setShowRawItemDetailModal] = useState(false);
  const [rawModalView, setRawModalView] = useState<'details' | 'quickAdd' | 'manualAdjust'>('details');
  
  const [quickAddSelection, setQuickAddSelection] = useState<RawInventoryItem | null>(null);
  const [quickAddQuantity, setQuickAddQuantity] = useState('');
  const [quickAddCost, setQuickAddCost] = useState('');

  const [showNewRawItemModal, setShowNewRawItemModal] = useState(false);
  const [newRawName, setNewRawName] = useState('');
  const [newRawUnit, setNewRawUnit] = useState('g');
  const [newRawStock, setNewRawStock] = useState('');
  const [newRawCost, setNewRawCost] = useState('');

  // Daily Closure state
  const [closureStats, setClosureStats] = useState<any>(null);
  const [closureHistory, setClosureHistory] = useState<any[]>([]);
  const [closureDenominations, setClosureDenominations] = useState<Record<string, number>>({});

  const getApiUrl = (path: string) => {
    const base = import.meta.env.VITE_API_URL || 
                 (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')
                   ? `http://${window.location.hostname}:3000`
                   : window.location.origin);
    return `${base}${path}`;
  };


  const handleSaveProduct = async (p: Product, imgFile?: File) => {
    try {
      let finalImageUrl = p.image;
      if (imgFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
        });
        reader.readAsDataURL(imgFile);
        const base64 = await base64Promise;

        const uploadRes = await fetch(getApiUrl('/api/upload-image'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64,
            fileName: imgFile.name,
            mimeType: imgFile.type
          })
        });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          finalImageUrl = url;
        }
      }

      const pToSave = { ...p, image: finalImageUrl };

      const isNew = editingProduct === 'new';
      const method = isNew ? 'POST' : 'PUT';
      const endpoint = isNew ? '/api/products' : `/api/products/${p.id}`;

      await fetch(getApiUrl(endpoint), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pToSave)
      });
      
      setEditingProduct(null);
      onInventoryUpdate(); // Reload products
    } catch (e) {
      console.error(e);
      alert('Error guardando el producto');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await fetch(getApiUrl(`/api/products/${id}`), { method: 'DELETE' });
      setEditingProduct(null);
      onInventoryUpdate();
    } catch (e) {
      console.error(e);
    }
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

      const rRes = await fetch(getApiUrl('/api/admin/raw-inventory'));
      if (rRes.ok) {
        const data = await rRes.json();
        data.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setRawInventory(data);
      }

      const tRes = await fetch(getApiUrl(`/api/admin/transactions?${queryParams}`));
      if (tRes.ok) setTransactions(await tRes.json());

      const oRes = await fetch(getApiUrl('/api/orders'));
      if (oRes.ok) setOrders(await oRes.json());

      const bRes = await fetch(getApiUrl('/api/admin/bakery-batches'));
      if (bRes.ok) setBakeryBatches(await bRes.json());

      const statsRes = await fetch(getApiUrl('/api/admin/closures/stats'));
      if (statsRes.ok) setClosureStats(await statsRes.json());

      const histRes = await fetch(getApiUrl('/api/admin/closures'));
      if (histRes.ok) setClosureHistory(await histRes.json());
    } catch (e) {
      console.error('Error loading admin data:', e);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [activeTab, viewMode, datePreset, customStartDate, customEndDate]);

  const handleAdjustClosureDenom = (denom: string, val: number) => {
    setClosureDenominations(prev => ({
      ...prev,
      [denom]: Math.max(0, (prev[denom] || 0) + val)
    }));
  };

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



  const handleSaveRecipe = async () => {
    if (!editingRecipeProduct) return;
    try {
      const res = await fetch(getApiUrl('/api/products/recipe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: editingRecipeProduct.id, recipe: editingRecipe }),
      });
      if (res.ok) {
        setEditingRecipeProduct(null);
        setEditingRecipe({});
        loadAllData();
      } else {
        alert('Error al guardar la receta.');
      }
    } catch (e) {
      alert('Error de red.');
    }
  };

  const handleExecuteClosure = async () => {
    if (!closureStats) return;
    
    // Calculate total cash from denominations
    let finalCash = 0;
    const DENOM_VALUES: Record<string, number> = {
      bill_1000: 1000, bill_500: 500, bill_200: 200, bill_100: 100, bill_50: 50, bill_20: 20,
      coin_20: 20, coin_10: 10, coin_5: 5, coin_2: 2, coin_1: 1, coin_0_50: 0.5, coin_0_20: 0.2
    };
    Object.entries(closureDenominations).forEach(([d, q]) => {
      finalCash += q * (DENOM_VALUES[d] || 0);
    });

    try {
      const res = await fetch(getApiUrl('/api/admin/closures'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...closureStats,
          cash_end: finalCash,
          denominations_left: closureDenominations
        })
      });
      if (res.ok) {
        alert('Corte de caja registrado con éxito. Empieza una nueva jornada.');
        setClosureDenominations({});
        loadAllData();
      } else alert('Error al registrar cierre.');
    } catch (e) {
      alert('Error de red.');
    }
  };

  const handleSaveManualAdjust = async () => {
    if (!quickAddSelection) return;
    const s = parseFloat(quickAddQuantity);
    const c = parseFloat(quickAddCost);
    if (isNaN(s) || isNaN(c)) { alert('Valores inválidos.'); return; }
    try {
      const res = await fetch(getApiUrl('/api/admin/raw-inventory'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: quickAddSelection.id, stock: s, cost: c }),
      });
      if (res.ok) {
        setShowRawItemDetailModal(false);
        loadAllData();
      } else alert('Error al guardar ajuste.');
    } catch (e) { alert('Error de red.'); }
  };

  const handleSaveQuickAdd = async () => {
    if (!quickAddSelection || !quickAddQuantity || !quickAddCost) return;
    try {
      const res = await fetch(getApiUrl('/api/admin/raw-inventory/purchase'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: quickAddSelection.id, 
          addedStock: parseFloat(quickAddQuantity), 
          addedCost: parseFloat(quickAddCost) 
        }),
      });
      if (res.ok) {
        setShowRawItemDetailModal(false);
        setQuickAddSelection(null);
        setQuickAddQuantity('');
        setQuickAddCost('');
        loadAllData();
      } else {
        alert('Error al registrar compra rápida.');
      }
    } catch (e) {
      alert('Error de red.');
    }
  };

  const handleSaveNewRawItem = async () => {
    if (!newRawName || !newRawUnit) return;
    try {
      const newId = newRawName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
      const res = await fetch(getApiUrl('/api/admin/raw-inventory/add-item'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: newId, 
          name: newRawName, 
          unit: newRawUnit,
          stock: parseFloat(newRawStock) || 0,
          cost: parseFloat(newRawCost) || 0
        }),
      });
      if (res.ok) {
        setShowNewRawItemModal(false);
        setNewRawName('');
        setNewRawUnit('g');
        setNewRawStock('');
        setNewRawCost('');
        loadAllData();
      } else {
        alert('Error al crear insumo.');
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

  const calculateMaxProduction = (product: Product): number | null => {
    if (!product.recipe || Object.keys(product.recipe).length === 0) return null; // Infinito o N/A
    let minProduction = Infinity;
    for (const [ingId, qty] of Object.entries(product.recipe)) {
      const raw = rawInventory.find(r => r.id === ingId);
      const stock = raw ? raw.stock : 0;
      const possible = Math.floor(stock / Number(qty));
      if (possible < minProduction) minProduction = possible;
    }
    return minProduction;
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 className="section-subtitle" style={{ margin: 0 }}>COSTOS Y PRECIOS DE PRODUCTOS</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
              {isEditingMode && (
                <button className="checkout-btn" style={{ padding: '8px 15px', margin: 0, fontSize: '0.9rem' }} onClick={() => setEditingProduct('new')}>
                  + Añadir Nuevo Producto
                </button>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: '#333', padding: '8px 15px', borderRadius: 20, color: '#fff', fontWeight: 'bold' }}>
                Modo Edición
                <input type="checkbox" checked={isEditingMode} onChange={e => setIsEditingMode(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
              </label>
            </div>
          </div>
          <div className="inventory-table-wrapper">
            <table className="inventory-table-admin">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock Posible</th>
                  <th>Costo Preparación (Calculado)</th>
                  <th>Precio Venta</th>
                  <th>Utilidad Bruta</th>
                  <th>Receta</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const prepCost = calculateProductCost(p);
                  const maxProd = calculateMaxProduction(p);
                  const grossProfit = p.price - prepCost;
                  return (
                    <tr key={p.id}>
                      <td className="inventory-product-cell font-bold">{p.name}</td>
                      <td style={{ color: maxProd !== null && maxProd < 10 ? '#f43f5e' : '#10b981', fontWeight: 'bold' }}>
                        {maxProd !== null ? `${maxProd} un.` : 'N/A'}
                      </td>
                      <td>${prepCost.toFixed(2)} MXN</td>
                      <td>
                        <div className="cost-input-wrapper">
                          <span>$</span>
                          <input type="number" id={`price-${p.id}`} className="inventory-input-number" defaultValue={p.price} />
                          <button className="admin-submit-btn" style={{padding: '5px 10px', fontSize: '0.8rem', marginLeft: 10}} onClick={() => {
                            const val = (document.getElementById(`price-${p.id}`) as HTMLInputElement).value;
                            handleUpdateProductPrice(p.id, parseFloat(val));
                          }}>Guardar</button>
                        </div>
                      </td>
                      <td className="font-bold" style={{ color: grossProfit > 0 ? '#10b981' : '#ef4444' }}>
                        ${grossProfit.toFixed(2)} MXN
                      </td>
                      <td>
                        <button className="admin-submit-btn" style={{padding: '5px 10px', fontSize: '0.8rem', background: '#4b5563'}} onClick={() => {
                          setEditingRecipeProduct(p);
                          setEditingRecipe(p.recipe || {});
                        }}>Ajustar Receta</button>
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
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
            <h3 className="section-subtitle" style={{margin: 0}}>INVENTARIO DE INSUMOS</h3>
            <button className="admin-submit-btn" style={{width: 'auto', padding: '10px 20px'}} onClick={() => setShowNewRawItemModal(true)}>+ Crear Nuevo Insumo</button>
          </div>
          
          <div className="quick-add-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20}}>
            {rawInventory.map(item => {
              const unitCost = item.stock > 0 ? (item.cost / item.stock) : 0;
              return (
                <div key={item.id} className="raw-inventory-card" style={{
                  background: '#2a1a1e', padding: 20, borderRadius: 12, border: '1px solid #ea580c', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center'
                }} onClick={() => { 
                  setQuickAddSelection(item); 
                  setQuickAddQuantity(item.stock.toString());
                  setQuickAddCost(item.cost.toString());
                  setRawModalView('details');
                  setShowRawItemDetailModal(true); 
                }}>
                  <div style={{fontSize: '2.5rem', marginBottom: 10}}>{item.name.match(/[\p{Emoji}\u200d]+/gu)?.[0] || '📦'}</div>
                  <h4 style={{textAlign: 'center', marginBottom: 5, fontSize: '1.1rem'}}>{item.name.replace(/[\p{Emoji}\u200d]+/gu, '').trim()}</h4>
                  <div style={{textAlign: 'center', color: '#ea580c', fontWeight: 'bold', fontSize: '1.2rem'}}>{item.stock} {item.unit}</div>
                  <div style={{textAlign: 'center', color: '#888', fontSize: '0.9rem', marginTop: 5}}>${unitCost.toFixed(2)} MXN/{item.unit}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'closure' && (
        <div className="admin-closure-container" style={{ padding: 20 }}>
          <h3 className="section-subtitle">CORTE DE CAJA (JORNADA ACTUAL)</h3>
          
          {closureStats && (
            <div style={{ background: '#2a1a1e', padding: 25, borderRadius: 12, border: '1px solid #ea580c', marginBottom: 30 }}>
              <p style={{ color: '#aaa', marginBottom: 15 }}>Ventas registradas desde: {closureStats.last_closure_at ? new Date(closureStats.last_closure_at).toLocaleString() : 'El inicio de los tiempos'}</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 15, marginBottom: 25 }}>
                <div style={{ background: '#1c1c1c', padding: 15, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>Ventas Totales</p>
                  <h3 style={{ margin: 0, color: '#10b981' }}>${closureStats.total_sales.toFixed(2)}</h3>
                </div>
                <div style={{ background: '#1c1c1c', padding: 15, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>+ Otros Ingresos</p>
                  <h3 style={{ margin: 0, color: '#10b981' }}>${closureStats.total_income.toFixed(2)}</h3>
                </div>
                <div style={{ background: '#1c1c1c', padding: 15, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>- Egresos (Compras)</p>
                  <h3 style={{ margin: 0, color: '#ef4444' }}>${closureStats.total_costs.toFixed(2)}</h3>
                </div>
                <div style={{ background: '#1c1c1c', padding: 15, borderRadius: 8, border: '1px solid #ea580c' }}>
                  <p style={{ margin: 0, color: '#ea580c', fontSize: '0.9rem', fontWeight: 'bold' }}>Utilidad Neta</p>
                  <h3 style={{ margin: 0, color: '#ea580c' }}>${closureStats.net_profit.toFixed(2)}</h3>
                </div>
              </div>

              <div style={{ background: '#1c1c1c', padding: 20, borderRadius: 12 }}>
                <h4 style={{ color: '#fff', marginBottom: 15, borderBottom: '1px solid #333', paddingBottom: 10 }}>¿Qué denominaciones dejarás como Fondo de Caja para mañana?</h4>
                <div className="cash-adjust-grid" style={{ marginBottom: 20 }}>
                  <div className="cash-adjust-column">
                    <h5 className="column-subtitle" style={{marginBottom: 10, color: '#888'}}>💵 BILLETES</h5>
                    <div className="cash-adjust-list">
                      {Object.keys(DENOM_LABELS).filter(k => k.includes('bill')).map(denom => {
                        const currentVal = (closureDenominations[denom] || 0) * DENOM_VALUES[denom];
                        return (
                          <div key={denom} className="cash-adjust-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span className="cash-adjust-label" style={{ width: 80 }}>{DENOM_LABELS[denom]}</span>
                            <div className="cash-adjust-controls" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <button className="cash-qty-btn" onClick={() => handleAdjustClosureDenom(denom, -5)}>-5</button>
                              <button className="cash-qty-btn" onClick={() => handleAdjustClosureDenom(denom, -1)}>-</button>
                              <span className="cash-qty-value" style={{ width: 30, textAlign: 'center', fontWeight: 'bold' }}>{closureDenominations[denom] || 0}</span>
                              <button className="cash-qty-btn" onClick={() => handleAdjustClosureDenom(denom, 1)}>+</button>
                              <button className="cash-qty-btn" onClick={() => handleAdjustClosureDenom(denom, 5)}>+5</button>
                              <span className="cash-value-display" style={{ width: 60, textAlign: 'right', color: '#10b981' }}>${currentVal.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="cash-adjust-column">
                    <h5 className="column-subtitle" style={{marginBottom: 10, color: '#888'}}>🪙 MONEDAS</h5>
                    <div className="cash-adjust-list">
                      {Object.keys(DENOM_LABELS).filter(k => k.includes('coin')).map(denom => {
                        const currentVal = (closureDenominations[denom] || 0) * DENOM_VALUES[denom];
                        return (
                          <div key={denom} className="cash-adjust-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span className="cash-adjust-label" style={{ width: 80 }}>{DENOM_LABELS[denom]}</span>
                            <div className="cash-adjust-controls" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <button className="cash-qty-btn" onClick={() => handleAdjustClosureDenom(denom, -5)}>-5</button>
                              <button className="cash-qty-btn" onClick={() => handleAdjustClosureDenom(denom, -1)}>-</button>
                              <span className="cash-qty-value" style={{ width: 30, textAlign: 'center', fontWeight: 'bold' }}>{closureDenominations[denom] || 0}</span>
                              <button className="cash-qty-btn" onClick={() => handleAdjustClosureDenom(denom, 1)}>+</button>
                              <button className="cash-qty-btn" onClick={() => handleAdjustClosureDenom(denom, 5)}>+5</button>
                              <span className="cash-value-display" style={{ width: 60, textAlign: 'right', color: '#10b981' }}>${currentVal.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #333', paddingTop: 20 }}>
                  <div>
                    <span style={{ color: '#888', fontSize: '0.9rem' }}>Fondo de Caja Total Calculado:</span>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1.8rem' }}>
                      ${Object.entries(closureDenominations).reduce((sum, [d, qty]) => sum + (qty * (DENOM_VALUES[d] || 0)), 0).toFixed(2)} MXN
                    </h3>
                  </div>
                  <button className="checkout-btn" onClick={handleExecuteClosure} style={{ padding: '15px 30px', fontSize: '1.1rem' }}>
                    🔒 Ejecutar Cierre de Caja y Sincronizar
                  </button>
                </div>
              </div>
            </div>
          )}

          <h3 className="section-subtitle">HISTORIAL DE CIERRES</h3>
          <div className="inventory-table-wrapper" style={{ marginBottom: 40 }}>
            <table className="inventory-table-admin">
              <thead>
                <tr>
                  <th>Fecha y Hora de Cierre</th>
                  <th>Ventas</th>
                  <th>Ingresos Extras</th>
                  <th>Egresos</th>
                  <th>Utilidad Neta</th>
                  <th>Efectivo Dejado</th>
                </tr>
              </thead>
              <tbody>
                {closureHistory.map((c: any) => (
                  <tr key={c.id}>
                    <td>{new Date(c.closed_at).toLocaleString()}</td>
                    <td style={{ color: '#10b981' }}>${c.total_sales.toFixed(2)}</td>
                    <td style={{ color: '#10b981' }}>${c.total_income.toFixed(2)}</td>
                    <td style={{ color: '#ef4444' }}>${c.total_costs.toFixed(2)}</td>
                    <td style={{ color: '#ea580c', fontWeight: 'bold' }}>${c.net_profit.toFixed(2)}</td>
                    <td>${c.cash_end.toFixed(2)}</td>
                  </tr>
                ))}
                {closureHistory.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center' }}>No hay cierres registrados.</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 className="section-subtitle">ALERTAS</h3>
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

      {/* MODALS */}
      {editingRecipeProduct && (
        <div className="checkout-modal-overlay" onClick={() => setEditingRecipeProduct(null)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 600}}>
            <h2 style={{color: '#ea580c', marginBottom: 20}}>Receta: {editingRecipeProduct.name}</h2>
            
            <div style={{marginBottom: 20}}>
              <h3 style={{marginBottom: 10}}>Ingredientes Actuales</h3>
              {Object.entries(editingRecipe).map(([ingId, qty]) => {
                const raw = rawInventory.find(r => r.id === ingId);
                if (!raw) return null;
                return (
                  <div key={ingId} style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10}}>
                    <span style={{flex: 1}}>{raw.name}</span>
                    <input type="number" className="admin-input-text" style={{width: 80}} value={qty} onChange={e => setEditingRecipe({...editingRecipe, [ingId]: parseFloat(e.target.value) || 0})} />
                    <span>{raw.unit}</span>
                    <button className="admin-submit-btn" style={{width: 'auto', background: '#ef4444'}} onClick={() => {
                      const newR = {...editingRecipe};
                      delete newR[ingId];
                      setEditingRecipe(newR);
                    }}>X</button>
                  </div>
                );
              })}
              {Object.keys(editingRecipe).length === 0 && <p style={{color: '#888'}}>No hay ingredientes.</p>}
            </div>

            <div style={{marginBottom: 20, padding: 15, background: '#1c1c1c', borderRadius: 8}}>
              <h3 style={{marginBottom: 10}}>Añadir Ingrediente</h3>
              <div style={{display: 'flex', gap: 10}}>
                <select id="newIngSelect" className="admin-input-text" style={{flex: 1}}>
                  <option value="">Selecciona un insumo...</option>
                  {rawInventory.filter(r => !editingRecipe[r.id]).map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.unit})</option>
                  ))}
                </select>
                <input type="number" id="newIngQty" className="admin-input-text" style={{width: 80}} placeholder="Cant." />
                <button className="admin-submit-btn" style={{width: 'auto'}} onClick={() => {
                  const sel = document.getElementById('newIngSelect') as HTMLSelectElement;
                  const qty = document.getElementById('newIngQty') as HTMLInputElement;
                  if (sel.value && qty.value) {
                    setEditingRecipe({...editingRecipe, [sel.value]: parseFloat(qty.value)});
                    sel.value = '';
                    qty.value = '';
                  }
                }}>Añadir</button>
              </div>
            </div>

            <div style={{display: 'flex', gap: 10, marginTop: 20}}>
              <button className="checkout-btn" onClick={handleSaveRecipe}>Guardar Receta</button>
              <button className="cancel-btn" onClick={() => setEditingRecipeProduct(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

            {showRawItemDetailModal && quickAddSelection && (
        <div className="checkout-modal-overlay" style={{ backdropFilter: 'blur(5px)' }} onClick={() => setShowRawItemDetailModal(false)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()} style={{textAlign: 'center', maxWidth: 450, position: 'relative'}}>
            <button 
              onClick={() => setShowRawItemDetailModal(false)}
              style={{position: 'absolute', top: 15, right: 15, background: 'transparent', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer'}}
            >✕</button>

            {rawModalView === 'details' && (
              <>
                <div style={{fontSize: '4rem', marginBottom: 10}}>{quickAddSelection.name.match(/[\p{Emoji}\u200d]+/gu)?.[0] || '📦'}</div>
                <h2 style={{color: '#fff', marginBottom: 20, fontSize: '1.8rem'}}>{quickAddSelection.name.replace(/[\p{Emoji}\u200d]+/gu, '').trim()}</h2>
                
                <div style={{background: '#1c1c1c', borderRadius: 12, padding: 20, marginBottom: 20}}>
                  <p style={{fontSize: '1rem', color: '#888', marginBottom: 5}}>Stock Disponible</p>
                  <h3 style={{fontSize: '2rem', color: '#ea580c', margin: 0}}>{quickAddSelection.stock} <span style={{fontSize: '1rem'}}>{quickAddSelection.unit}</span></h3>
                  <div style={{marginTop: 15, paddingTop: 15, borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between'}}>
                    <div>
                      <p style={{fontSize: '0.8rem', color: '#888', margin: 0}}>Costo Total</p>
                      <p style={{fontWeight: 'bold', margin: 0}}>${quickAddSelection.cost.toFixed(2)}</p>
                    </div>
                    <div>
                      <p style={{fontSize: '0.8rem', color: '#888', margin: 0}}>Costo Unitario</p>
                      <p style={{fontWeight: 'bold', margin: 0}}>${(quickAddSelection.stock > 0 ? quickAddSelection.cost / quickAddSelection.stock : 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                  <button className="checkout-btn" onClick={() => {
                    setQuickAddQuantity('');
                    setQuickAddCost('');
                    setRawModalView('quickAdd');
                  }}>+ Registrar Compra / Recarga</button>
                  <button className="admin-submit-btn" style={{background: '#4b5563'}} onClick={() => {
                    setQuickAddQuantity(quickAddSelection.stock.toString());
                    setQuickAddCost(quickAddSelection.cost.toString());
                    setRawModalView('manualAdjust');
                  }}>⚙️ Ajuste Manual de Inventario</button>
                </div>
              </>
            )}

            {rawModalView === 'quickAdd' && (
              <>
                <h2 style={{color: '#ea580c', marginBottom: 20}}>Registrar Compra: {quickAddSelection.name}</h2>
                <div className="admin-form-group" style={{textAlign: 'left'}}>
                  <label>Cantidad Comprada ({quickAddSelection.unit})</label>
                  <input type="number" className="admin-input-text" value={quickAddQuantity} onChange={e => setQuickAddQuantity(e.target.value)} placeholder={`Ej. 1000`} />
                </div>
                <div className="admin-form-group" style={{textAlign: 'left'}}>
                  <label>Costo Total de la Compra ($ MXN)</label>
                  <input type="number" className="admin-input-text" value={quickAddCost} onChange={e => setQuickAddCost(e.target.value)} placeholder="Ej. 150" />
                </div>
                <p style={{fontSize: '0.9rem', color: '#aaa', marginBottom: 20, textAlign: 'left'}}>
                  Esto aumentará el stock y registrará automáticamente un egreso (gasto) en las finanzas de la cafetería.
                </p>
                <div style={{display: 'flex', gap: 10}}>
                  <button className="checkout-btn" onClick={handleSaveQuickAdd}>Registrar Compra</button>
                  <button className="cancel-btn" onClick={() => setRawModalView('details')}>Atrás</button>
                </div>
              </>
            )}

            {rawModalView === 'manualAdjust' && (
              <>
                <h2 style={{color: '#ea580c', marginBottom: 20}}>Ajuste Manual: {quickAddSelection.name}</h2>
                <div className="admin-form-group" style={{textAlign: 'left'}}>
                  <label>Stock Físico Real ({quickAddSelection.unit})</label>
                  <input type="number" className="admin-input-text" value={quickAddQuantity} onChange={e => setQuickAddQuantity(e.target.value)} />
                </div>
                <div className="admin-form-group" style={{textAlign: 'left'}}>
                  <label>Costo Total del Stock ($ MXN)</label>
                  <input type="number" className="admin-input-text" value={quickAddCost} onChange={e => setQuickAddCost(e.target.value)} />
                </div>
                <p style={{fontSize: '0.9rem', color: '#aaa', marginBottom: 20, textAlign: 'left'}}>
                  Utiliza esta opción para corregir mermas, desperdicios o errores. **No se registrará ningún egreso financiero.**
                </p>
                <div style={{display: 'flex', gap: 10}}>
                  <button className="checkout-btn" onClick={handleSaveManualAdjust}>Guardar Ajuste</button>
                  <button className="cancel-btn" onClick={() => setRawModalView('details')}>Atrás</button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {showNewRawItemModal && (
        <div className="checkout-modal-overlay" onClick={() => setShowNewRawItemModal(false)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{color: '#ea580c', marginBottom: 20}}>Nuevo Insumo</h2>
            <div className="admin-form-group">
              <label>Nombre y Emoji (Ej. 🥛 Leche Entera)</label>
              <input type="text" className="admin-input-text" value={newRawName} onChange={e => setNewRawName(e.target.value)} placeholder="☕️ Grano Espresso" />
            </div>
            <div className="admin-form-group">
              <label>Unidad de Medida (Ej. g, ml, pza)</label>
              <input type="text" className="admin-input-text" value={newRawUnit} onChange={e => setNewRawUnit(e.target.value)} placeholder="g" />
            </div>
            <div className="admin-form-group">
              <label>Stock Inicial (Opcional)</label>
              <input type="number" className="admin-input-text" value={newRawStock} onChange={e => setNewRawStock(e.target.value)} placeholder="0" />
            </div>
            <div className="admin-form-group">
              <label>Costo Inicial ($ MXN) (Opcional)</label>
              <input type="number" className="admin-input-text" value={newRawCost} onChange={e => setNewRawCost(e.target.value)} placeholder="0" />
            </div>
            <p style={{fontSize: '0.9rem', color: '#aaa', marginBottom: 20}}>
              Si ingresas un Costo Inicial mayor a 0, se registrará como un egreso automático en el historial.
            </p>
            <div style={{display: 'flex', gap: 10}}>
              <button className="checkout-btn" onClick={handleSaveNewRawItem}>Crear Insumo</button>
              <button className="cancel-btn" onClick={() => setShowNewRawItemModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
