import { AdminVouchersPanel } from './AdminVouchersPanel';
import React, { useState, useEffect } from 'react';
import type { Product } from '../types';
import { ProductEditorModal } from './ProductEditorModal';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { apiFetch, getPrincipal, publicError } from '../services/api';
import { OperationsPanel } from './OperationsPanel';
import { AccessPanel } from './AccessPanel';
import { ReportsPanel } from './ReportsPanel';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { DenominationInput } from './DenominationInput';
import { PendingPointPanel } from './PendingPointPanel';
import { TerminalPanel } from './TerminalPanel';
import { UiIcon, type UiIconName } from './UiIcon';
import { ProductionPanel } from './ProductionPanel';
import { PickupAdminPanel } from './PickupAdminPanel';
import { createOperationId } from '../utils/id';

interface AdminViewProps {
  products: Product[];
  onClose: () => void;
  onOpenBarista: () => void;
  onInventoryUpdate: () => void;
}

interface Metrics {
  revenue: number;
  costs: number;
  profit: number;
  cashInRegister: number;
  transactionsCount: number;
  salesToday: number;
  salesWeek: number;
  salesMonth: number;
  tickets: number;
  averageTicket: number;
  grossMarginPercent: number;
  expectedCash: number;
  cashDifference: number;
  bestProducts: Array<{ product: string; quantity: number; revenue: number }>;
  lowInventory: Array<{ id: string; name: string; stock: number; unit: string; minStock: number }>;
}

interface RawInventoryItem {
  id: string;
  name: string;
  unit: string;
  stock: number;
  cost: number;
}

interface CashTransaction { id: number; type: string; amount: number; description: string; created_at: string }
interface ClosureStats { last_closure_at: string | null; total_sales: number; total_income: number; total_costs: number; net_profit: number; cash_start: number; cash_end: number; products_sold: Record<string, number> }
interface DailyClosure { id: string; closed_at: string; cash_start: number; cash_end: number; total_sales: number }
interface CashSession { id: string; openedAt: string; openingAmount: number; expectedCash?: number }

const DENOM_LABELS: Record<string, string> = {
  bill_1000: 'Billetes de $1000', bill_500: 'Billetes de $500',
  bill_200: 'Billetes de $200', bill_100: 'Billetes de $100',
  bill_50: 'Billetes de $50', bill_20: 'Billetes de $20',
  coin_20: 'Monedas de $20', coin_10: 'Monedas de $10',
  coin_5: 'Monedas de $5', coin_2: 'Monedas de $2',
  coin_1: 'Monedas de $1', coin_0_50: 'Monedas de 50¢', coin_0_20: 'Monedas de 20¢',
};

const DENOM_VALUES: Record<string, number> = {
  bill_1000: 1000, bill_500: 500, bill_200: 200, bill_100: 100,
  bill_50: 50, bill_20: 20, coin_20: 20, coin_10: 10,
  coin_5: 5, coin_2: 2, coin_1: 1, coin_0_50: 0.5, coin_0_20: 0.2,
};

type TabId = 'dashboard' | 'products' | 'cash' | 'costs' | 'raw_inventory' | 'operations' | 'production' | 'reports' | 'access' | 'closure' | 'terminal' | 'pickup' | 'vouchers';

const TABS: { id: TabId; icon: UiIconName; label: string; section: string }[] = [
  { id: 'dashboard', icon: 'grid', label: 'Dashboard', section: 'Principal' },
  { id: 'products', icon: 'coffee', label: 'Productos', section: 'Principal' },
  { id: 'cash', icon: 'cash', label: 'Caja', section: 'Finanzas' },
  { id: 'costs', icon: 'chart', label: 'Costos', section: 'Finanzas' },
  { id: 'closure', icon: 'lock', label: 'Cortes', section: 'Finanzas' },
  { id: 'vouchers', icon: 'qr', label: 'Cupones de cambio', section: 'Finanzas' },
  { id: 'reports', icon: 'chart', label: 'Reportes', section: 'Finanzas' },
  { id: 'raw_inventory', icon: 'box', label: 'Inventario', section: 'Operaciones' },
  { id: 'operations', icon: 'refresh', label: 'Abastecimiento', section: 'Operaciones' },
  { id: 'production', icon: 'box', label: 'Producción', section: 'Operaciones' },
  { id: 'terminal', icon: 'terminal', label: 'Terminal Point', section: 'Sistema' },
  { id: 'pickup', icon: 'qr', label: 'Pedidos QR', section: 'Sistema' },
  { id: 'access', icon: 'users', label: 'Accesos', section: 'Sistema' },
];

export const AdminView: React.FC<AdminViewProps> = ({ products, onClose, onInventoryUpdate, onOpenBarista }) => {
  const actions = useAsyncAction();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null | 'new'>(null);
  const [metrics, setMetrics] = useState<Metrics>({ revenue: 0, costs: 0, profit: 0, cashInRegister: 0, transactionsCount: 0, salesToday: 0, salesWeek: 0, salesMonth: 0, tickets: 0, averageTicket: 0, grossMarginPercent: 0, expectedCash: 0, cashDifference: 0, bestProducts: [], lowInventory: [] });
  const [adjustedRegister, setAdjustedRegister] = useState<Record<string, number>>({});
  const [rawInventory, setRawInventory] = useState<RawInventoryItem[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);

  const [viewMode, setViewMode] = useState<'operativa' | 'inversion'>('operativa');
  const [datePreset, setDatePreset] = useState<'today' | 'this_month' | 'this_year' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [txDenominations, setTxDenominations] = useState<Record<string, number>>({});
  const [txOperationId, setTxOperationId] = useState(() => createOperationId());
  const [purchaseCash, setPurchaseCash] = useState<Record<string, number>>({});
  const [txType, setTxType] = useState<'manual_income' | 'manual_expense' | 'manual_investment'>('manual_expense');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txError, setTxError] = useState('');
  const [txSuccess, setTxSuccess] = useState('');

  const [auditTx, setAuditTx] = useState<CashTransaction | null>(null);
  const [auditAction, setAuditAction] = useState<'modify' | 'delete'>('delete');
  const [auditReason, setAuditReason] = useState('');
  const [auditNewAmount, setAuditNewAmount] = useState('');

  const [editingRecipeProduct, setEditingRecipeProduct] = useState<Product | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Record<string, number>>({});

  const [showRawItemDetailModal, setShowRawItemDetailModal] = useState(false);
  const [rawModalView, setRawModalView] = useState<'details' | 'quickAdd' | 'manualAdjust'>('details');
  const [quickAddSelection, setQuickAddSelection] = useState<RawInventoryItem | null>(null);
  const [quickAddQuantity, setQuickAddQuantity] = useState('');
  const [quickAddCost, setQuickAddCost] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'credit'>('transfer');
  const [purchaseOperationId, setPurchaseOperationId] = useState(() => createOperationId());

  const [showNewRawItemModal, setShowNewRawItemModal] = useState(false);
  const [newRawName, setNewRawName] = useState('');
  const [newRawUnit, setNewRawUnit] = useState('g');

  const [closureStats, setClosureStats] = useState<ClosureStats | null>(null);
  const [closureHistory, setClosureHistory] = useState<DailyClosure[]>([]);
  const [closureDenominations, setClosureDenominations] = useState<Record<string, number>>({});
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [cashOpenOperation, setCashOpenOperation] = useState(() => sessionStorage.getItem('rofe.cash.open.operation') || createOperationId());

  const handleSaveProduct = async (p: Product, imgFile?: File) => {
    let image = p.image;
    if (imgFile) {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = () => reject(new Error('No pudimos leer la imagen. Selecciona el archivo de nuevo.')); reader.readAsDataURL(imgFile);
      });
      const upload = await apiFetch('/api/upload-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileBase64, fileName: imgFile.name, mimeType: imgFile.type }) });
      if (!upload.ok) throw new Error(await publicError(upload));
      image = ((await upload.json()) as { url: string }).url;
      if (!image) throw new Error('El servidor no pudo guardar la imagen. Intenta de nuevo.');
    }
    const editing = products.some((product) => product.id === p.id);
    const response = await apiFetch(editing ? `/api/products/${encodeURIComponent(p.id)}` : '/api/products', {
      method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, image }),
    });
    if (!response.ok) throw new Error(await publicError(response));
    onInventoryUpdate(); setEditingProduct(null);
  };
  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('¿Eliminar este producto del catálogo? Los pedidos anteriores se conservarán.')) return;
    const response = await apiFetch(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await publicError(response));
    onInventoryUpdate(); setEditingProduct(null);
  };

  const loadMetrics = async () => {
    try {
      const response = await apiFetch('/api/admin/metrics');
      if (!response.ok) throw new Error(await publicError(response));
      setMetrics(await response.json() as Metrics);
    } catch { setTxError('No pudimos cargar las métricas administrativas.'); }
  };

  const loadRawInventory = async () => {
    const res = await apiFetch('/api/admin/raw-inventory');
    if (res.ok) setRawInventory(await res.json());
  };
  const loadTransactions = async () => {
    const res = await apiFetch('/api/admin/transactions');
    if (res.ok) setTransactions(await res.json());
  };
  const loadClosureData = async () => {
    const [statsRes, historyRes, sessionRes] = await Promise.all([
      apiFetch('/api/admin/closures/stats'), apiFetch('/api/admin/closures'), apiFetch('/api/admin/cash/session'),
    ]);
    if (statsRes.ok) setClosureStats(await statsRes.json());
    if (historyRes.ok) setClosureHistory(await historyRes.json());
    if (sessionRes.ok) {
      const payload = await sessionRes.json() as { current?: CashSession };
      setCashSession(payload.current ?? null);
    }
  };
  const loadCashDenominations = async () => {
    const res = await apiFetch('/api/cash/denominations');
    if (res.ok) setAdjustedRegister(await res.json());
  };

  useEffect(() => { void Promise.all([loadMetrics(), loadRawInventory(), loadTransactions(), loadCashDenominations()]).catch(() => setTxError('No pudimos cargar la administración. Revisa la conexión.')); }, []);
  useEffect(() => { if (activeTab === 'closure') void loadClosureData().catch(() => setTxError('No pudimos cargar la caja. Reintenta la conexión.')); }, [activeTab]);

  const handleAddTransaction = async () => {
    setTxError(''); setTxSuccess('');
    const amount = Number(txAmount);
    if (!amount || amount <= 0) { setTxError('Monto inválido.'); return; }
    if (!txDescription.trim()) { setTxError('Describe la transacción.'); return; }
    const res = await apiFetch('/api/admin/cash/transaction', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: txType, amount, description: txDescription, denominations: txDenominations, operationId: txOperationId }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setTxError(err?.error?.message || 'Error al registrar.'); return; }
    setTxDenominations({}); setTxOperationId(createOperationId()); setTxSuccess('Transacción registrada.'); setTxAmount(''); setTxDescription('');
    loadTransactions(); loadMetrics();
  };

  const handleAuditTransaction = async () => {
    if (!auditTx) return;
    if (!auditReason.trim()) { alert('Indica la razón de la auditoría.'); return; }
    if (auditAction === 'modify') {
      const newAmount = Number(auditNewAmount);
      if (!newAmount || newAmount <= 0) { alert('Nuevo monto inválido.'); return; }
      const response = await apiFetch(`/api/admin/transactions/${auditTx.id}/audit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'modified', newAmount, auditReason }) });
      if (!response.ok) throw new Error(await publicError(response));
    } else {
      const response = await apiFetch(`/api/admin/transactions/${auditTx.id}/audit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'deleted', auditReason }) });
      if (!response.ok) throw new Error(await publicError(response));
    }
    setAuditTx(null); setAuditReason(''); setAuditNewAmount('');
    loadTransactions(); loadMetrics();
  };

  const handleSaveRecipe = async () => {
    if (!editingRecipeProduct) return;
    const res = await apiFetch('/api/products/recipe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: editingRecipeProduct.id, recipe: editingRecipe }),
    });
    if (!res.ok) throw new Error(await publicError(res));
    onInventoryUpdate(); setEditingRecipeProduct(null);
  };

  const handleManualAdjust = async (itemId: string, stock: number, cost: number, reason: string) => {
    const response = await apiFetch(`/api/admin/raw-inventory/${encodeURIComponent(itemId)}/adjust`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock, cost, reason, operationId: createOperationId() }),
    });
    if (!response.ok) throw new Error(await publicError(response));
    loadRawInventory(); loadMetrics();
  };

  const handleSaveNewRawItem = async () => {
    const res = await apiFetch('/api/admin/raw-inventory/add-item', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newRawName.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''), name: newRawName, unit: newRawUnit, stock: 0, cost: 0 }),
    });
    if (!res.ok) throw new Error(await publicError(res));
    if (res.ok) { setShowNewRawItemModal(false); setNewRawName(''); setNewRawUnit('g'); loadRawInventory(); loadMetrics(); }
  };

  const handleSaveQuickAdd = async () => {
    if (!quickAddSelection) return;
    const qty = Number(quickAddQuantity); const cost = Number(quickAddCost);
    if (!qty || qty <= 0) { alert('Cantidad inválida.'); return; }
    const response = await apiFetch('/api/admin/purchases', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId: purchaseOperationId, paymentMethod: purchasePaymentMethod, cashDenominations: purchasePaymentMethod === 'cash' ? purchaseCash : undefined, items: [{ ingredientId: quickAddSelection.id, quantity: qty, unitCost: cost / qty }] }),
    });
    if (!response.ok) throw new Error(await publicError(response));
    setRawModalView('details'); setQuickAddQuantity(''); setQuickAddCost(''); setPurchaseOperationId(createOperationId());
    loadRawInventory(); loadMetrics();
  };

  const handleSaveManualAdjust = async () => {
    if (!quickAddSelection) return;
    const qty = Number(quickAddQuantity); const cost = Number(quickAddCost);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(cost) || cost < 0) { alert('Stock o costo inválido.'); return; }
    if (adjustmentReason.trim().length < 5) { alert('Indica una razón de al menos 5 caracteres.'); return; }
    await handleManualAdjust(quickAddSelection.id, qty, cost, adjustmentReason);
    setRawModalView('details'); setQuickAddQuantity(''); setQuickAddCost(''); setAdjustmentReason('');
  };

  const handleCloseSession = async () => {
    if (!window.confirm('¿Cerrar la sesión de caja actual? Se registrará un corte.')) return;
    const res = await apiFetch('/api/admin/cash/session/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: cashSession?.id, denominations: closureDenominations }) });
    if (!res.ok) throw new Error(await publicError(res));
    await loadClosureData(); await loadMetrics();
  };

  const handleOpenSession = async () => {
    sessionStorage.setItem('rofe.cash.open.operation', cashOpenOperation);
    const res = await apiFetch('/api/admin/cash/session/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ denominations: closureDenominations, operationId: cashOpenOperation }),
    });
    if (!res.ok) {
      const message = await publicError(res);
      if (res.status === 409) {
        await loadClosureData();
        sessionStorage.removeItem('rofe.cash.open.operation'); setCashOpenOperation(createOperationId());
      }
      throw new Error(message);
    }
    sessionStorage.removeItem('rofe.cash.open.operation'); setCashOpenOperation(createOperationId());
    setClosureDenominations({});
    await loadClosureData(); await loadMetrics();
  };

  return (
    <div className="admin-view">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h2>ROFE Admin</h2>
          <p>{getPrincipal()?.role === 'ADMIN' ? 'Administrador' : 'Manager'}</p>
        </div>
        <nav className="admin-nav">
          {['Principal', 'Finanzas', 'Operaciones', 'Sistema'].map((section) => (
            <React.Fragment key={section}>
              <div className="admin-nav-section">{section}</div>
              {TABS.filter((tab) => tab.section === section && (tab.id !== 'access' || getPrincipal()?.role === 'ADMIN')).map((tab) => (
                <button key={tab.id} className={`admin-tab-btn${activeTab === tab.id ? ' active' : ''}`} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>
                  <span className="tab-icon"><UiIcon name={tab.icon} /></span>
                  {tab.label}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <div className="admin-sidebar-footer"><button className="admin-exit-btn" onClick={onOpenBarista}>Abrir barra / KDS</button>
          <button className="admin-exit-btn" onClick={onClose}>← Salir del panel</button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="admin-content" id="main-content">
        {txError && <p className="inline-feedback error" role="alert">{txError}</p>}
        {actions.error && <p className="inline-feedback error" role="alert">{actions.error}</p>}
        {actions.busy && <p role="status" className="admin-saving">Guardando cambios…</p>}
        {activeTab === 'terminal' && <><header><h2>Terminal Point</h2><p>Conexión y disponibilidad del cobro con tarjeta.</p></header><div className="admin-content-body"><TerminalPanel /><PendingPointPanel /></div></>}
        {/* ===== DASHBOARD ===== */}
        {activeTab === 'dashboard' && (
          <>
            <header>

              <h2>Dashboard</h2>
              <p>Métricas clave del negocio en tiempo real.</p>
            </header>
            <div className="admin-content-body">
              <div className="metrics-row">
                <div className="metric-card"><span className="metric-label">Ventas hoy</span><span className="metric-value revenue">${metrics.salesToday.toFixed(2)}</span></div>
                <div className="metric-card"><span className="metric-label">Ventas semana</span><span className="metric-value revenue">${metrics.salesWeek.toFixed(2)}</span></div>
                <div className="metric-card"><span className="metric-label">Ventas mes</span><span className="metric-value revenue">${metrics.salesMonth.toFixed(2)}</span></div>
                <div className="metric-card"><span className="metric-label">Margen bruto</span><span className="metric-value profit">{metrics.grossMarginPercent.toFixed(1)}%</span></div>
              </div>
              <div className="metrics-row">
                <div className="metric-card"><span className="metric-label">Tickets</span><span className="metric-value">{metrics.tickets}</span></div>
                <div className="metric-card"><span className="metric-label">Ticket promedio</span><span className="metric-value">${metrics.averageTicket.toFixed(2)}</span></div>
                <div className="metric-card"><span className="metric-label">Efectivo contado</span><span className="metric-value cash">${metrics.cashInRegister.toFixed(2)}</span></div>
                <div className="metric-card"><span className="metric-label">Diferencia de caja</span><span className={`metric-value ${metrics.cashDifference === 0 ? 'profit' : 'costs'}`}>${metrics.cashDifference.toFixed(2)}</span></div>
              </div>

              <div className="admin-dashboard-split">
                <div className="chart-container">
                  <h3>Ingresos vs Costos</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={[{ name: 'Hoy', ingresos: metrics.revenue, costos: metrics.costs }]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} />
                      <Tooltip cursor={false} contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '13px' }} />
                      <Bar dataKey="ingresos" fill="var(--status-success)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="costos" fill="var(--status-error)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-container">
                  <h3>Productos Más Vendidos</h3>
                  {metrics.bestProducts.length ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={metrics.bestProducts.map((entry) => ({ name: entry.product, qty: entry.quantity }))} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis type="number" stroke="var(--text-muted)" fontSize={12} />
                        <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={12} width={100} />
                        <Tooltip cursor={false} contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '13px' }} />
                        <Bar dataKey="qty" fill="var(--accent-warm)" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Sin datos de ventas aún.</p>}
                </div>
              </div>
              {metrics.lowInventory.length > 0 && (
                <div className="chart-container" style={{ marginTop: 'var(--space-6)' }} role="status">
                  <h3>Inventario por debajo del mínimo</h3>
                  <p style={{ color: 'var(--status-error)', margin: 0 }}>{metrics.lowInventory.map((item) => `${item.name}: ${item.stock} ${item.unit} (mín. ${item.minStock})`).join(' · ')}</p>
                </div>
              )}
              {closureStats?.last_closure_at && (
                <div className="chart-container" style={{ marginTop: 'var(--space-6)' }}>
                  <h3>Último Corte de Caja</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>
                    {new Date(closureStats.last_closure_at).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}
                    {' — '}Ventas: ${closureStats.total_sales?.toFixed(2)} | Efectivo final: ${closureStats.cash_end?.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ===== PRODUCTS ===== */}
        {activeTab === 'products' && (
          <>
            <header>

              <h2>Productos</h2>
              <p>Gestiona el menú, recetas, costos de producción y precios para el cliente.</p>
            </header>
            <div className="admin-content-body">
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <button className="btn btn-primary" onClick={() => setEditingProduct('new')}>+ Nuevo Producto</button>
                <button className={`btn ${isEditingMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setIsEditingMode(!isEditingMode)}>
                  {isEditingMode ? 'Listo' : 'Editar Productos'}
                </button>
              </div>

              {/* Product Grid */}
              <div className="products-admin-list">
                {products.map((product) => {
                  const recipeCost = product.recipe
                    ? Object.entries(product.recipe).reduce((sum, [ingId, qty]) => {
                        const ing = rawInventory.find((r) => r.id === ingId);
                        return sum + (ing && ing.stock > 0 ? (ing.cost / ing.stock) * qty : 0);
                      }, 0)
                    : 0;
                  return (
                    <div key={product.id} className="product-admin-card" onClick={() => isEditingMode && setEditingProduct(product)}>
                      <div className="card-header">
                        <span className="card-name">{product.name}</span>
                        <span className="card-category">{product.category}</span>
                      </div>
                      {product.description && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>{product.description}</p>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span className="card-price">${product.price.toFixed(2)}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Costo: ${recipeCost.toFixed(2)}
                        </span>
                      </div>
                      {isEditingMode && (
                        <div className="card-actions">
                          <button onClick={(e) => { e.stopPropagation(); setEditingProduct(product); }}>Editar</button>
                          <button onClick={(e) => { e.stopPropagation(); setEditingRecipeProduct(product); setEditingRecipe(product.recipe || {}); }}>Receta</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ===== CASH ===== */}
        {activeTab === 'cash' && (
          <>
            <header>

              <h2>Caja</h2>
              <p>Conteo actual de la gaveta. Las denominaciones sólo cambian mediante apertura, cobros, movimientos y cierre auditables.</p>
            </header>
            <div className="admin-content-body">
              <div className="admin-cash-container">
                <div className="cash-adjust-sections">
                  <div>
                    <h3 className="column-subtitle">Billetes</h3>
                    <div className="cash-adjust-list">
                      {['bill_1000', 'bill_500', 'bill_200', 'bill_100', 'bill_50', 'bill_20'].map((key) => (
                        <div key={key} className="cash-adjust-row">
                          <span className="cash-adjust-label">{DENOM_LABELS[key]}</span>
                          <div className="cash-adjust-controls">
                            <span className="cash-qty-value">{adjustedRegister[key] || 0}</span>
                          </div>
                          <span className="cash-value-display">${((adjustedRegister[key] || 0) * (DENOM_VALUES[key] || 0)).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="column-subtitle">Monedas</h3>
                    <div className="cash-adjust-list">
                      {['coin_20', 'coin_10', 'coin_5', 'coin_2', 'coin_1', 'coin_0_50', 'coin_0_20'].map((key) => (
                        <div key={key} className="cash-adjust-row">
                          <span className="cash-adjust-label">{DENOM_LABELS[key]}</span>
                          <div className="cash-adjust-controls">
                            <span className="cash-qty-value">{adjustedRegister[key] || 0}</span>
                          </div>
                          <span className="cash-value-display">${((adjustedRegister[key] || 0) * (DENOM_VALUES[key] || 0)).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="cash-adjust-footer">
                  <div className="total-cash-calculated">
                    <span>TOTAL EN CAJA</span>
                    <h2>${Object.entries(adjustedRegister).reduce((sum, [key, qty]) => sum + (DENOM_VALUES[key] || 0) * (qty || 0), 0).toFixed(2)}</h2>
                  </div>

                </div>
              </div>
            </div>
          </>
        )}

        {/* ===== COSTS ===== */}
        {activeTab === 'costs' && (
          <>
            <header>

              <h2>Costos y Egresos</h2>
              <p>Visualiza, registra y audita todos los movimientos financieros.</p>
            </header>
            <div className="admin-content-body">
              {/* View Mode Toggle */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <button className={`admin-tab-btn ${viewMode === 'operativa' ? 'active' : ''}`} onClick={() => setViewMode('operativa')} style={{ width: 'auto', padding: '10px 20px' }}>
                  <span className="tab-icon">📊</span> Visión Operativa
                </button>
                <button className={`admin-tab-btn ${viewMode === 'inversion' ? 'active' : ''}`} onClick={() => setViewMode('inversion')} style={{ width: 'auto', padding: '10px 20px' }}>
                  <span className="tab-icon">💎</span> Visión Inversión
                </button>
              </div>

              {/* Date Filters */}
              <div className="dashboard-controls">
                <select value={datePreset} onChange={(e) => setDatePreset(e.target.value as typeof datePreset)}>
                  <option value="today">Hoy</option>
                  <option value="this_month">Este Mes</option>
                  <option value="this_year">Este Año</option>
                  <option value="custom">Personalizado</option>
                </select>
                {datePreset === 'custom' && (
                  <>
                    <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} />
                    <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} />
                  </>
                )}
              </div>

              {/* Register Transaction */}
              <div className="chart-container" style={{ marginBottom: '24px' }}>
                <h3>Registrar movimiento en efectivo</h3>
                <DenominationInput value={txDenominations} onChange={setTxDenominations} />
                {txError && <div className="inline-feedback error" role="alert">{txError}</div>}
                {txSuccess && <div className="inline-feedback success" role="status">{txSuccess}</div>}
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <select value={txType} onChange={(e) => setTxType(e.target.value as typeof txType)} style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '0.88rem', minHeight: '44px' }}>
                    <option value="manual_expense">Egreso</option>
                    <option value="manual_income">Ingreso</option>
                    <option value="manual_investment">Inversión</option>
                  </select>
                  <input className="admin-input-text" type="number" placeholder="Monto $" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} style={{ width: '140px' }} />
                  <input className="admin-input-text" placeholder="Descripción" value={txDescription} onChange={(e) => setTxDescription(e.target.value)} style={{ flex: 1, minWidth: '200px' }} />
                  <button className="btn btn-primary" disabled={actions.busy} onClick={() => void actions.run(handleAddTransaction)}>Registrar</button>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="inventory-table-wrapper">
                <table className="inventory-table-admin">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Monto</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {transactions.filter((tx) => {
                      if (viewMode === 'inversion') return tx.type === 'manual_investment';
                      return tx.type !== 'manual_investment';
                    }).map((tx) => (
                      <tr key={tx.id}>
                        <td>{new Date(tx.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td><span className={`status-pill ${tx.type === 'manual_income' ? 'pill-completed' : 'pill-cancelled'}`}>{tx.type === 'manual_income' ? 'Ingreso' : tx.type === 'manual_investment' ? 'Inversión' : 'Egreso'}</span></td>
                        <td>{tx.description}</td>
                        <td className="font-bold" style={{ color: tx.type === 'manual_income' ? 'var(--status-success)' : 'var(--status-error)' }}>${tx.amount.toFixed(2)}</td>
                        <td className="inventory-actions-cell">
                          <button className="stock-adjust-btn btn-stock-minus" onClick={() => { setAuditTx(tx); setAuditAction('modify'); setAuditNewAmount(String(tx.amount)); }}>Modificar</button>
                          <button className="stock-adjust-btn btn-stock-minus" onClick={() => { setAuditTx(tx); setAuditAction('delete'); }}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                    {transactions.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Sin movimientos.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ===== RAW INVENTORY ===== */}
        {activeTab === 'raw_inventory' && (
          <>
            <header>

              <h2>Inventario de Insumos</h2>
              <p>Controla el stock de ingredientes y materias primas. Los costos de producción se calculan desde aquí.</p>
            </header>
            <div className="admin-content-body">
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <button className="btn btn-primary" onClick={() => setShowNewRawItemModal(true)}>+ Nuevo Insumo</button>
              </div>
              <div className="inventory-table-wrapper">
                <table className="inventory-table-admin">
                  <thead><tr><th>Insumo</th><th>Unidad</th><th>Stock</th><th>Costo Promedio</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {rawInventory.map((item) => (
                      <tr key={item.id}>
                        <td className="font-bold">{item.name}</td>
                        <td>{item.unit}</td>
                        <td>{item.stock}</td>
                        <td>${item.cost.toFixed(2)}</td>
                        <td className="inventory-actions-cell">
                          <button className="stock-adjust-btn btn-stock-plus" onClick={() => { setQuickAddSelection(item); setRawModalView('details'); setShowRawItemDetailModal(true); }}>Gestionar</button>
                        </td>
                      </tr>
                    ))}
                    {rawInventory.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Sin insumos registrados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ===== OPERATIONS ===== */}
        {activeTab === 'operations' && (
          <>
            <header>

              <h2>Abastecimiento</h2>
              <p>Registra compras, mermas y proveedores.</p>
            </header>
            <div className="admin-content-body">
              <OperationsPanel onInventoryUpdate={() => { loadRawInventory(); loadMetrics(); onInventoryUpdate(); }} />
            </div>
          </>
        )}

        {/* ===== PRODUCTION ===== */}
        {activeTab === 'production' && (
          <>
            <header><h2>Producción</h2><p>Transforma materias primas en producto terminado con costo y trazabilidad.</p></header>
            <div className="admin-content-body"><ProductionPanel products={products} onInventoryUpdate={() => { loadRawInventory(); loadMetrics(); onInventoryUpdate(); }} /></div>
          </>
        )}

        {/* ===== REPORTS ===== */}
        {activeTab === 'vouchers' && <><header><h2>Cupones de cambio</h2><p>Saldos a favor de clientes: obligación pendiente de ROFÉ, no descuentos.</p></header><div className="admin-content-body"><AdminVouchersPanel /></div></>}
        {activeTab === 'pickup' && <><header><h2>Pedidos QR · Pickup</h2><p>Tu menú en el celular del cliente, con pago en Stripe y recogida en barra.</p></header><div className="admin-content-body"><PickupAdminPanel /></div></>}
        {activeTab === 'reports' && (
          <><header><h2>Reportes</h2><p>Analiza ventas, costos, rentabilidad y actividad operativa.</p></header><div className="admin-content-body"><ReportsPanel /></div></>
        )}

        {/* ===== ACCESS ===== */}
        {activeTab === 'access' && (
          <>
            <header>

              <h2>Accesos</h2>
              <p>Gestiona cuentas de administrador, manager y barista con sus permisos.</p>
            </header>
            <div className="admin-content-body">
              <AccessPanel />
            </div>
          </>
        )}

        {/* ===== CLOSURE ===== */}
        {activeTab === 'closure' && (
          <>
            <header>

              <h2>Cortes de Caja</h2>
              <p>Consulta el historial y cierra sesiones de caja.</p>
            </header>
            <div className="admin-content-body">
              {cashSession ? (
                <div className="chart-container" style={{ marginBottom: '24px' }}>
                  <h3>Sesión Activa</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '8px 0 0' }}>Abierta desde: {new Date(cashSession.openedAt).toLocaleString('es-MX')} · Esperado: ${(cashSession.expectedCash ?? cashSession.openingAmount).toFixed(2)}</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Cuenta físicamente la gaveta antes de cerrar.</p>
                  <div className="denom-grid" style={{ marginTop: '16px' }}>
                    {Object.keys(DENOM_VALUES).map((key) => (
                      <div key={key} className="denom-item">
                        <label>{DENOM_LABELS[key]}</label>
                        <input type="number" min="0" value={closureDenominations[key] ?? 0} onChange={(e) => setClosureDenominations((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px' }}><button className="btn btn-primary" disabled={actions.busy} onClick={() => void actions.run(handleCloseSession)}>Cerrar Sesión de Caja</button></div>
                </div>
              ) : (
                <div className="chart-container" style={{ marginBottom: '24px' }}>
                  <h3>Abrir Nueva Sesión</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '8px 0 0' }}>No hay sesión activa. Ingresa las denominaciones iniciales.</p>
                  <div className="denom-grid" style={{ marginTop: '16px' }}>
                    {Object.keys(DENOM_VALUES).map((key) => (
                      <div key={key} className="denom-item">
                        <label>{DENOM_LABELS[key]}</label>
                        <input type="number" min="0" value={closureDenominations[key] ?? 0} onChange={(e) => setClosureDenominations((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px' }}><button className="btn btn-primary" disabled={actions.busy} onClick={() => void actions.run(handleOpenSession)}>Abrir Sesión</button></div>
                </div>
              )}

              {closureStats && (
                <div className="closure-stats" style={{ marginTop: '24px' }}>
                  <div className="metric-card"><span className="metric-label">Ventas del Período</span><span className="metric-value revenue">${closureStats.total_sales?.toFixed(2) || '0.00'}</span></div>
                  <div className="metric-card"><span className="metric-label">Ganancia Neta</span><span className="metric-value profit">${closureStats.net_profit?.toFixed(2) || '0.00'}</span></div>
                </div>
              )}

              <div className="inventory-table-wrapper" style={{ marginTop: '24px' }}>
                <table className="inventory-table-admin">
                  <thead><tr><th>Fecha de Cierre</th><th>Efectivo Inicial</th><th>Efectivo Final</th><th>Ventas</th></tr></thead>
                  <tbody>
                    {closureHistory.map((closure) => (
                      <tr key={closure.id}>
                        <td>{new Date(closure.closed_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td>${closure.cash_start?.toFixed(2)}</td>
                        <td>${closure.cash_end?.toFixed(2)}</td>
                        <td className="font-bold">${closure.total_sales?.toFixed(2)}</td>
                      </tr>
                    ))}
                    {closureHistory.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Sin cortes registrados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ===== MODALS ===== */}
      {auditTx && (
        <div className="modal-backdrop" onClick={() => setAuditTx(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-logo)', margin: '0 0 24px' }}>Auditar Transacción</h2>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Acción</label>
              <select value={auditAction} onChange={(e) => setAuditAction(e.target.value as typeof auditAction)} style={{ padding: '10px 16px', width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '0.88rem', minHeight: '44px' }}>
                <option value="modify">Modificar Monto</option>
                <option value="delete">Eliminar</option>
              </select>
            </div>
            {auditAction === 'modify' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Nuevo Monto</label>
                <input className="admin-input-text" type="number" value={auditNewAmount} onChange={(e) => setAuditNewAmount(e.target.value)} style={{ width: '100%' }} />
              </div>
            )}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Razón de Auditoría</label>
              <textarea className="admin-input-text" value={auditReason} onChange={(e) => setAuditReason(e.target.value)} placeholder="Explica por qué se modifica o elimina..." style={{ width: '100%', minHeight: '80px', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-primary" disabled={actions.busy} onClick={() => void actions.run(handleAuditTransaction)}>Confirmar</button>
              <button className="btn btn-secondary" onClick={() => setAuditTx(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {editingRecipeProduct && (
        <div className="modal-backdrop" onClick={() => setEditingRecipeProduct(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h2 style={{ fontFamily: 'var(--font-logo)', margin: '0 0 8px' }}>Receta: {editingRecipeProduct.name}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 24px' }}>Define cuánto consume cada insumo por unidad. Esto determina el costo de producción.</p>
            {rawInventory.map((item) => (
              <div key={item.id} style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{item.name} ({item.unit})</label>
                <input className="admin-input-text" type="number" min="0" step="0.001" value={editingRecipe[item.id] ?? 0} onChange={(e) => setEditingRecipe((prev) => ({ ...prev, [item.id]: Number(e.target.value) || 0 }))} style={{ width: '100%' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button className="btn btn-primary" disabled={actions.busy} onClick={() => void actions.run(handleSaveRecipe)}>Guardar Receta</button>
              <button className="btn btn-secondary" onClick={() => setEditingRecipeProduct(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showRawItemDetailModal && quickAddSelection && (
        <div className="modal-backdrop" onClick={() => setShowRawItemDetailModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <span style={{ fontSize: '3rem', background: 'var(--bg-tertiary)', padding: '12px 20px', borderRadius: 'var(--radius-lg)' }}>📦</span>
              <div>
                <h2 style={{ fontFamily: 'var(--font-logo)', margin: '0', fontSize: '1.4rem' }}>{quickAddSelection.name}</h2>
                <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: '0.88rem' }}>Stock: {quickAddSelection.stock} {quickAddSelection.unit} · Costo: ${quickAddSelection.cost.toFixed(2)}</p>
              </div>
            </div>
            {rawModalView === 'details' && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setRawModalView('quickAdd')}>Registrar Compra</button>
                <button className="btn btn-secondary" onClick={() => setRawModalView('manualAdjust')}>Ajuste Manual</button>
                <button className="btn btn-ghost" onClick={() => setShowRawItemDetailModal(false)}>Cerrar</button>
              </div>
            )}
            {rawModalView === 'quickAdd' && (
              <>
                <h2 style={{ fontFamily: 'var(--font-logo)', color: 'var(--accent-warm)', margin: '0 0 20px' }}>Registrar Compra</h2>
                <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Cantidad ({quickAddSelection.unit})</label><input className="admin-input-text" type="number" value={quickAddQuantity} onChange={(e) => setQuickAddQuantity(e.target.value)} style={{ width: '100%' }} /></div>
                <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Costo Total ($ MXN)</label><input className="admin-input-text" type="number" value={quickAddCost} onChange={(e) => setQuickAddCost(e.target.value)} style={{ width: '100%' }} /></div>
                <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Método de Pago</label><select value={purchasePaymentMethod} onChange={(e) => setPurchasePaymentMethod(e.target.value as typeof purchasePaymentMethod)} style={{ padding: '10px 16px', width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '0.88rem', minHeight: '44px' }}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="credit">Crédito</option></select></div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>Solo compras en efectivo afectan la caja.</p>
                {purchasePaymentMethod === 'cash' && <DenominationInput value={purchaseCash} onChange={setPurchaseCash} label="Efectivo de la compra" />}
                <div style={{ display: 'flex', gap: '12px' }}><button className="btn btn-primary" disabled={actions.busy} onClick={() => void actions.run(handleSaveQuickAdd)}>Registrar Compra</button><button className="btn btn-secondary" onClick={() => setRawModalView('details')}>Atrás</button></div>
              </>
            )}
            {rawModalView === 'manualAdjust' && (
              <>
                <h2 style={{ fontFamily: 'var(--font-logo)', color: 'var(--status-pending)', margin: '0 0 20px' }}>Ajuste Manual</h2>
                <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Stock Físico Real ({quickAddSelection.unit})</label><input className="admin-input-text" type="number" value={quickAddQuantity} onChange={(e) => setQuickAddQuantity(e.target.value)} style={{ width: '100%' }} /></div>
                <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Costo Total del Stock ($ MXN)</label><input className="admin-input-text" type="number" value={quickAddCost} onChange={(e) => setQuickAddCost(e.target.value)} style={{ width: '100%' }} /></div>
                <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Razón del ajuste</label><input className="admin-input-text" value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} maxLength={240} placeholder="Ej. conteo físico de cierre" style={{ width: '100%' }} /></div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>Para corregir mermas o errores. No se registra egreso.</p>
                <div style={{ display: 'flex', gap: '12px' }}><button className="btn btn-primary" disabled={actions.busy} onClick={() => void actions.run(handleSaveManualAdjust)}>Guardar Ajuste</button><button className="btn btn-secondary" onClick={() => setRawModalView('details')}>Atrás</button></div>
              </>
            )}
          </div>
        </div>
      )}

      {showNewRawItemModal && (
        <div className="modal-backdrop" onClick={() => setShowNewRawItemModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '3rem', background: 'var(--bg-tertiary)', padding: '12px 20px', borderRadius: 'var(--radius-lg)' }}>📦</span>
              <div><h2 style={{ fontFamily: 'var(--font-logo)', margin: '0', fontSize: '1.5rem' }}>Añadir Nuevo Insumo</h2><p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: '0.88rem' }}>Ingresa los detalles del insumo.</p></div>
            </div>
            <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Nombre y Emoji</label><input className="admin-input-text" value={newRawName} onChange={(e) => setNewRawName(e.target.value)} placeholder="☕️ Grano Espresso" style={{ width: '100%' }} /></div>
            <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Unidad de Medida</label><input className="admin-input-text" value={newRawUnit} onChange={(e) => setNewRawUnit(e.target.value)} placeholder="g" style={{ width: '100%' }} /></div>
            <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>El insumo se crea en cero. Registra la existencia inicial como una compra para conservar costo, proveedor y trazabilidad.</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>Si el costo es mayor a 0, se registra como egreso automático.</p>
            <div style={{ display: 'flex', gap: '12px' }}><button className="btn btn-primary" disabled={actions.busy} onClick={() => void actions.run(handleSaveNewRawItem)}>Crear Insumo</button><button className="btn btn-secondary" onClick={() => setShowNewRawItemModal(false)}>Cancelar</button></div>
          </div>
        </div>
      )}

      {editingProduct && (
        <ProductEditorModal product={editingProduct === 'new' ? undefined : editingProduct} rawInventory={rawInventory} onSave={handleSaveProduct} onClose={() => setEditingProduct(null)} onDelete={handleDeleteProduct} />
      )}
    </div>
  );
};
