const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add rawModalView state
const stateTarget = `  const [showRawItemDetailModal, setShowRawItemDetailModal] = useState(false);`;
const stateRep = `  const [showRawItemDetailModal, setShowRawItemDetailModal] = useState(false);
  const [rawModalView, setRawModalView] = useState<'details' | 'quickAdd' | 'manualAdjust'>('details');`;
content = content.replace(stateTarget, stateRep);

// 2. Click handler for the card: reset to 'details'
const cardClickTarget = `                }} onClick={() => { 
                  setQuickAddSelection(item); 
                  setQuickAddQuantity(item.stock.toString());
                  setQuickAddCost(item.cost.toString());
                  setShowRawItemDetailModal(true); 
                }}>`;
const cardClickRep = `                }} onClick={() => { 
                  setQuickAddSelection(item); 
                  setQuickAddQuantity(item.stock.toString());
                  setQuickAddCost(item.cost.toString());
                  setRawModalView('details');
                  setShowRawItemDetailModal(true); 
                }}>`;
content = content.replace(cardClickTarget, cardClickRep);

// 3. Replace the three Modals with a single one.
// The easiest way is to use a regex to match the three overlays.
const allModalsRegex = /\{\s*showRawItemDetailModal[\s\S]*?\{\s*showQuickAddModal[\s\S]*?<\/div>\s*<\/div>\s*\)\s*\}/;

const newModalCode = `      {showRawItemDetailModal && quickAddSelection && (
        <div className="checkout-modal-overlay" style={{ backdropFilter: 'blur(5px)' }} onClick={() => setShowRawItemDetailModal(false)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()} style={{textAlign: 'center', maxWidth: 450, position: 'relative'}}>
            <button 
              onClick={() => setShowRawItemDetailModal(false)}
              style={{position: 'absolute', top: 15, right: 15, background: 'transparent', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer'}}
            >✕</button>

            {rawModalView === 'details' && (
              <>
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
                  <input type="number" className="admin-input-text" value={quickAddQuantity} onChange={e => setQuickAddQuantity(e.target.value)} placeholder={\`Ej. 1000\`} />
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
      )}`;

content = content.replace(allModalsRegex, newModalCode);

fs.writeFileSync(file, content);
