const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

const uiTarget = `              <div style={{ display: 'flex', gap: 20, alignItems: 'center', background: '#1c1c1c', padding: 20, borderRadius: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 10, color: '#fff', fontWeight: 'bold' }}>¿Cuánto Efectivo dejarás en la Caja como fondo para la siguiente jornada?</label>
                  <input type="number" className="admin-input-text" value={cashLeftInRegister} onChange={e => setCashLeftInRegister(e.target.value)} placeholder="Ej. 500" style={{ width: '100%', maxWidth: 300 }} />
                </div>
                <button className="checkout-btn" onClick={handleExecuteClosure} style={{ padding: '15px 30px', fontSize: '1.1rem' }}>
                  🔒 Ejecutar Cierre de Caja
                </button>
              </div>`;

const uiRep = `              <div style={{ background: '#1c1c1c', padding: 20, borderRadius: 12 }}>
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
                              <span className="cash-value-display" style={{ width: 60, textAlign: 'right', color: '#10b981' }}>\${currentVal.toFixed(2)}</span>
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
                              <span className="cash-value-display" style={{ width: 60, textAlign: 'right', color: '#10b981' }}>\${currentVal.toFixed(2)}</span>
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
                      \${Object.entries(closureDenominations).reduce((sum, [d, qty]) => sum + (qty * (DENOM_VALUES[d] || 0)), 0).toFixed(2)} MXN
                    </h3>
                  </div>
                  <button className="checkout-btn" onClick={handleExecuteClosure} style={{ padding: '15px 30px', fontSize: '1.1rem' }}>
                    🔒 Ejecutar Cierre de Caja y Sincronizar
                  </button>
                </div>
              </div>`;

content = content.replace(uiTarget, uiRep);

fs.writeFileSync(file, content);
