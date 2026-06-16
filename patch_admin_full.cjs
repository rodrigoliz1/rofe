const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add new states
const stateTarget = `  const [showQuickAddModal, setShowQuickAddModal] = useState(false);`;
const stateRep = `  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [showRawItemDetailModal, setShowRawItemDetailModal] = useState(false);
  const [showManualAdjustModal, setShowManualAdjustModal] = useState(false);

  const [closureStats, setClosureStats] = useState<any>(null);
  const [closureHistory, setClosureHistory] = useState<any[]>([]);
  const [cashLeftInRegister, setCashLeftInRegister] = useState('');`;
content = content.replace(stateTarget, stateRep);

// 2. Fetch closures and sort raw inventory
const loadTarget = `      const [invRes, rawRes, regRes, txRes, alertsRes, bakeryRes] = await Promise.all([
        fetch(getApiUrl('/api/inventory')),
        fetch(getApiUrl('/api/admin/raw-inventory')),
        fetch(getApiUrl('/api/admin/cash')),
        fetch(getApiUrl(\`/api/admin/transactions?\${queryParams}\`)),
        fetch(getApiUrl('/api/admin/alerts')),
        fetch(getApiUrl('/api/admin/bakery-batches'))
      ]);

      if (mRes.ok) setMetrics(await mRes.json());

      const cRes = await fetch(getApiUrl('/api/admin/cash'));
      if (cRes.ok) setAdjustedRegister(await cRes.json());

      const rRes = await fetch(getApiUrl('/api/admin/raw-inventory'));
      if (rRes.ok) setRawInventory(await rRes.json());

      const tRes = await fetch(getApiUrl(\`/api/admin/transactions?\${queryParams}\`));
      if (tRes.ok) setTransactions(await tRes.json());

      const oRes = await fetch(getApiUrl('/api/orders'));
      if (oRes.ok) setOrders(await oRes.json());

      const bRes = await fetch(getApiUrl('/api/admin/bakery-batches'));
      if (bRes.ok) setBakeryBatches(await bRes.json());`;

const loadRep = `      const [invRes, rawRes, regRes, txRes, alertsRes, bakeryRes, closureStatsRes, closureHistoryRes] = await Promise.all([
        fetch(getApiUrl('/api/inventory')),
        fetch(getApiUrl('/api/admin/raw-inventory')),
        fetch(getApiUrl('/api/admin/cash')),
        fetch(getApiUrl(\`/api/admin/transactions?\${queryParams}\`)),
        fetch(getApiUrl('/api/admin/alerts')),
        fetch(getApiUrl('/api/admin/bakery-batches')),
        fetch(getApiUrl('/api/admin/closures/stats')),
        fetch(getApiUrl('/api/admin/closures'))
      ]);

      if (mRes.ok) setMetrics(await mRes.json());
      if (regRes.ok) setAdjustedRegister(await regRes.json());

      if (rawRes.ok) {
        const data = await rawRes.json();
        data.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setRawInventory(data);
      }
      
      if (txRes.ok) setTransactions(await txRes.json());
      
      const oRes = await fetch(getApiUrl('/api/orders'));
      if (oRes.ok) setOrders(await oRes.json());

      if (bakeryRes.ok) setBakeryBatches(await bakeryRes.json());
      if (closureStatsRes.ok) setClosureStats(await closureStatsRes.json());
      if (closureHistoryRes.ok) setClosureHistory(await closureHistoryRes.json());`;
content = content.replace(loadTarget, loadRep);

// 3. Handlers
const funcTarget = `  const handleSaveBakeryBatch = async () => {`;
const funcRep = `  const handleExecuteClosure = async () => {
    if (!closureStats) return;
    const finalCash = parseFloat(cashLeftInRegister);
    if (isNaN(finalCash)) {
      alert('Por favor ingresa cuánto efectivo dejarás en caja (Fondo de Caja).');
      return;
    }
    try {
      const res = await fetch(getApiUrl('/api/admin/closures'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...closureStats,
          cash_end: finalCash
        })
      });
      if (res.ok) {
        alert('Corte de caja registrado con éxito. Empieza una nueva jornada.');
        setCashLeftInRegister('');
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
        setShowManualAdjustModal(false);
        loadAllData();
      } else alert('Error al guardar ajuste.');
    } catch (e) { alert('Error de red.'); }
  };

  const handleSaveBakeryBatch = async () => {`;
content = content.replace(funcTarget, funcRep);

// 4. Update click handler on raw-inventory-card
const cardTarget = `                }} onClick={() => { setQuickAddSelection(item); setShowQuickAddModal(true); }}>`;
const cardRep = `                }} onClick={() => { 
                  setQuickAddSelection(item); 
                  setQuickAddQuantity(item.stock.toString());
                  setQuickAddCost(item.cost.toString());
                  setShowRawItemDetailModal(true); 
                }}>`;
content = content.replace(cardTarget, cardRep);

// 5. Replace closure tab JSX
const closureTabTarget = `{activeTab === 'closure' && (
        <div className="admin-closure-container" style={{ padding: 20 }}>
          <h3 className="section-subtitle">CIERRE DE CAJA Y ALERTAS</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>`;
const closureTabRep = `{activeTab === 'closure' && (
        <div className="admin-closure-container" style={{ padding: 20 }}>
          <h3 className="section-subtitle">CORTE DE CAJA (JORNADA ACTUAL)</h3>
          
          {closureStats && (
            <div style={{ background: '#2a1a1e', padding: 25, borderRadius: 12, border: '1px solid #ea580c', marginBottom: 30 }}>
              <p style={{ color: '#aaa', marginBottom: 15 }}>Ventas registradas desde: {closureStats.last_closure_at ? new Date(closureStats.last_closure_at).toLocaleString() : 'El inicio de los tiempos'}</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 15, marginBottom: 25 }}>
                <div style={{ background: '#1c1c1c', padding: 15, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>Ventas Totales</p>
                  <h3 style={{ margin: 0, color: '#10b981' }}>\${closureStats.total_sales.toFixed(2)}</h3>
                </div>
                <div style={{ background: '#1c1c1c', padding: 15, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>+ Otros Ingresos</p>
                  <h3 style={{ margin: 0, color: '#10b981' }}>\${closureStats.total_income.toFixed(2)}</h3>
                </div>
                <div style={{ background: '#1c1c1c', padding: 15, borderRadius: 8 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>- Egresos (Compras)</p>
                  <h3 style={{ margin: 0, color: '#ef4444' }}>\${closureStats.total_costs.toFixed(2)}</h3>
                </div>
                <div style={{ background: '#1c1c1c', padding: 15, borderRadius: 8, border: '1px solid #ea580c' }}>
                  <p style={{ margin: 0, color: '#ea580c', fontSize: '0.9rem', fontWeight: 'bold' }}>Utilidad Neta</p>
                  <h3 style={{ margin: 0, color: '#ea580c' }}>\${closureStats.net_profit.toFixed(2)}</h3>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 20, alignItems: 'center', background: '#1c1c1c', padding: 20, borderRadius: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 10, color: '#fff', fontWeight: 'bold' }}>¿Cuánto Efectivo dejarás en la Caja como fondo para la siguiente jornada?</label>
                  <input type="number" className="admin-input-text" value={cashLeftInRegister} onChange={e => setCashLeftInRegister(e.target.value)} placeholder="Ej. 500" style={{ width: '100%', maxWidth: 300 }} />
                </div>
                <button className="checkout-btn" onClick={handleExecuteClosure} style={{ padding: '15px 30px', fontSize: '1.1rem' }}>
                  🔒 Ejecutar Cierre de Caja
                </button>
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
                {closureHistory.map(c => (
                  <tr key={c.id}>
                    <td>{new Date(c.closed_at).toLocaleString()}</td>
                    <td style={{ color: '#10b981' }}>\${c.total_sales.toFixed(2)}</td>
                    <td style={{ color: '#10b981' }}>\${c.total_income.toFixed(2)}</td>
                    <td style={{ color: '#ef4444' }}>\${c.total_costs.toFixed(2)}</td>
                    <td style={{ color: '#ea580c', fontWeight: 'bold' }}>\${c.net_profit.toFixed(2)}</td>
                    <td>\${c.cash_end.toFixed(2)}</td>
                  </tr>
                ))}
                {closureHistory.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center' }}>No hay cierres registrados.</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 className="section-subtitle">ALERTAS</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>`;
content = content.replace(closureTabTarget, closureTabRep);

// 6. Add modals HTML before quickadd
const modalTarget = `      {showQuickAddModal && quickAddSelection && (
        <div className="checkout-modal-overlay" onClick={() => setShowQuickAddModal(false)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{color: '#ea580c', marginBottom: 20}}>Añadido Rápido: {quickAddSelection.name}</h2>`;

const modalRep = `      {showRawItemDetailModal && quickAddSelection && (
        <div className="checkout-modal-overlay" onClick={() => setShowRawItemDetailModal(false)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()} style={{textAlign: 'center', maxWidth: 450}}>
            <div style={{fontSize: '4rem', marginBottom: 10}}>{quickAddSelection.name.match(/[\\p{Emoji}\\u200d]+/gu)?.[0] || '📦'}</div>
            <h2 style={{color: '#fff', marginBottom: 20, fontSize: '1.8rem'}}>{quickAddSelection.name.replace(/[\\p{Emoji}\\u200d]+/gu, '').trim()}</h2>
            
            <div style={{background: '#1c1c1c', borderRadius: 12, padding: 20, marginBottom: 20}}>
              <p style={{fontSize: '1rem', color: '#888', marginBottom: 5}}>Stock Disponible</p>
              <h3 style={{fontSize: '2rem', color: '#ea580c', margin: 0}}>{quickAddSelection.stock} <span style={{fontSize: '1rem'}}>{quickAddSelection.unit}</span></h3>
              <div style={{marginTop: 15, paddingTop: 15, borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between'}}>
                <div>
                  <p style={{fontSize: '0.8rem', color: '#888', margin: 0}}>Costo Total</p>
                  <p style={{fontWeight: 'bold', margin: 0}}>\${quickAddSelection.cost.toFixed(2)}</p>
                </div>
                <div>
                  <p style={{fontSize: '0.8rem', color: '#888', margin: 0}}>Costo Unitario</p>
                  <p style={{fontWeight: 'bold', margin: 0}}>\${(quickAddSelection.stock > 0 ? quickAddSelection.cost / quickAddSelection.stock : 0).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
              <button className="checkout-btn" onClick={() => {
                setQuickAddQuantity('');
                setQuickAddCost('');
                setShowRawItemDetailModal(false);
                setShowQuickAddModal(true);
              }}>+ Registrar Compra / Recarga</button>
              <button className="admin-submit-btn" style={{background: '#4b5563'}} onClick={() => {
                setQuickAddQuantity(quickAddSelection.stock.toString());
                setQuickAddCost(quickAddSelection.cost.toString());
                setShowRawItemDetailModal(false);
                setShowManualAdjustModal(true);
              }}>⚙️ Ajuste Manual de Inventario</button>
            </div>
          </div>
        </div>
      )}

      {showManualAdjustModal && quickAddSelection && (
        <div className="checkout-modal-overlay" onClick={() => setShowManualAdjustModal(false)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{color: '#ea580c', marginBottom: 20}}>Ajuste Manual: {quickAddSelection.name}</h2>
            <div className="admin-form-group">
              <label>Stock Físico Real ({quickAddSelection.unit})</label>
              <input type="number" className="admin-input-text" value={quickAddQuantity} onChange={e => setQuickAddQuantity(e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label>Costo Total del Stock ($ MXN)</label>
              <input type="number" className="admin-input-text" value={quickAddCost} onChange={e => setQuickAddCost(e.target.value)} />
            </div>
            <p style={{fontSize: '0.9rem', color: '#aaa', marginBottom: 20}}>
              Utiliza esta opción para corregir mermas, desperdicios o errores. **No se registrará ningún egreso financiero.**
            </p>
            <div style={{display: 'flex', gap: 10}}>
              <button className="checkout-btn" onClick={handleSaveManualAdjust}>Guardar Ajuste</button>
              <button className="cancel-btn" onClick={() => setShowManualAdjustModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showQuickAddModal && quickAddSelection && (
        <div className="checkout-modal-overlay" onClick={() => setShowQuickAddModal(false)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{color: '#ea580c', marginBottom: 20}}>Registrar Compra: {quickAddSelection.name}</h2>`;
content = content.replace(modalTarget, modalRep);

fs.writeFileSync(file, content);
