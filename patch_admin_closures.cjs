const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state variables
const stateTarget = `  const [bakeryExpirations, setBakeryExpirations] = useState<any[]>([]);`;
const stateReplacement = `  const [bakeryExpirations, setBakeryExpirations] = useState<any[]>([]);

  // Daily Closure state
  const [closureStats, setClosureStats] = useState<any>(null);
  const [closureHistory, setClosureHistory] = useState<any[]>([]);
  const [cashLeftInRegister, setCashLeftInRegister] = useState('');`;
content = content.replace(stateTarget, stateReplacement);

// 2. Add data fetching to loadAllData
const loadTarget = `      const [invRes, rawRes, regRes, txRes, alertsRes, bakeryRes] = await Promise.all([
        fetch(getApiUrl('/api/inventory')),
        fetch(getApiUrl('/api/admin/raw-inventory')),
        fetch(getApiUrl('/api/admin/cash')),
        fetch(getApiUrl('/api/admin/transactions')),
        fetch(getApiUrl('/api/admin/alerts')),
        fetch(getApiUrl('/api/admin/bakery-batches'))
      ]);`;
const loadReplacement = `      const [invRes, rawRes, regRes, txRes, alertsRes, bakeryRes, closureStatsRes, closureHistoryRes] = await Promise.all([
        fetch(getApiUrl('/api/inventory')),
        fetch(getApiUrl('/api/admin/raw-inventory')),
        fetch(getApiUrl('/api/admin/cash')),
        fetch(getApiUrl('/api/admin/transactions')),
        fetch(getApiUrl('/api/admin/alerts')),
        fetch(getApiUrl('/api/admin/bakery-batches')),
        fetch(getApiUrl('/api/admin/closures/stats')),
        fetch(getApiUrl('/api/admin/closures'))
      ]);`;
content = content.replace(loadTarget, loadReplacement);

const loadTarget2 = `      if (bakeryRes.ok) setBakeryBatches(await bakeryRes.json());`;
const loadReplacement2 = `      if (bakeryRes.ok) setBakeryBatches(await bakeryRes.json());
      if (closureStatsRes.ok) setClosureStats(await closureStatsRes.json());
      if (closureHistoryRes.ok) setClosureHistory(await closureHistoryRes.json());`;
content = content.replace(loadTarget2, loadReplacement2);

// 3. Add handle closure function
const funcTarget = `  const handleSaveBakeryBatch = async () => {`;
const funcReplacement = `  const handleExecuteClosure = async () => {
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
          cash_end: finalCash // Override with the money they ACTUALLY leave in the register
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

  const handleSaveBakeryBatch = async () => {`;
content = content.replace(funcTarget, funcReplacement);

// 4. Update the closure tab JSX
const jsxTarget = `{activeTab === 'closure' && (
        <div className="admin-closure-container" style={{ padding: 20 }}>
          <h3 className="section-subtitle">CIERRE DE CAJA Y ALERTAS</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>`;
          
const jsxReplacement = `{activeTab === 'closure' && (
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
content = content.replace(jsxTarget, jsxReplacement);

fs.writeFileSync(file, content);
