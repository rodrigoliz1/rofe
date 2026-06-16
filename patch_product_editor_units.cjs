const fs = require('fs');
const file = 'src/components/ProductEditorModal.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `{Object.entries(recipe).map(([id, qty]) => (
                <div key={id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>`;

const newStr = `{Object.entries(recipe).map(([id, qty]) => {
                const rawItem = rawInventory.find(r => r.id === id);
                return (
                <div key={id} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>`;

const targetStr2 = `onChange={e => updateRecipeItem(id, id, parseFloat(e.target.value))}
                  />
                  <button className="action-btn-small delete" onClick={() => removeRecipeItem(id)}>&times;</button>
                </div>
              ))}
              <button className="action-btn-small" onClick={handleAddRecipeItem}>+ Añadir Insumo</button>`;

const newStr2 = `onChange={e => updateRecipeItem(id, id, parseFloat(e.target.value))}
                  />
                  <span style={{color: '#888', fontSize: '0.9rem', minWidth: 30}}>{rawItem ? rawItem.unit : ''}</span>
                  <button className="action-btn-small delete" onClick={() => removeRecipeItem(id)}>&times;</button>
                </div>
              )})}
              <button className="action-btn-small" onClick={handleAddRecipeItem}>+ Añadir Insumo</button>`;

content = content.replace(targetStr, newStr);
content = content.replace(targetStr2, newStr2);
fs.writeFileSync(file, content);
