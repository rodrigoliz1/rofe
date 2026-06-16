const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `      {activeTab === 'costs' && (
        <div className="admin-inventory-container">
          <h3 className="section-subtitle">COSTOS Y PRECIOS DE PRODUCTOS</h3>
          <div className="inventory-table-wrapper">
            <table className="inventory-table-admin">`;

const repStr = `      {activeTab === 'costs' && (
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
            <table className="inventory-table-admin">`;

content = content.replace(targetStr, repStr);

const trTarget = `                    <tr key={p.id}>
                      <td className="inventory-product-cell font-bold">{p.name}</td>
                      <td style={{ color: maxProd !== null && maxProd < 10 ? '#f43f5e' : '#10b981', fontWeight: 'bold' }}>
                        {maxProd !== null ? \`\${maxProd} un.\` : 'N/A'}
                      </td>
                      <td>$\${prepCost.toFixed(2)} MXN</td>
                      <td>
                        <div className="cost-input-wrapper">
                          <span>$</span>
                          <input type="number" id={\`price-\${p.id}\`} className="inventory-input-number" defaultValue={p.price} />
                          <button className="action-btn-small" onClick={async () => {`;

const trRep = `                    <tr 
                      key={p.id} 
                      onClick={() => isEditingMode ? setEditingProduct(p) : null}
                      style={{ cursor: isEditingMode ? 'pointer' : 'default', transition: 'background 0.2s' }}
                      className={isEditingMode ? "inventory-row-hover" : ""}
                    >
                      <td className="inventory-product-cell font-bold">
                        {p.name} {isEditingMode && <span style={{fontSize: '0.8rem', color: '#ea580c', marginLeft: 10}}>✏️ Editar</span>}
                      </td>
                      <td style={{ color: maxProd !== null && maxProd < 10 ? '#f43f5e' : '#10b981', fontWeight: 'bold' }}>
                        {maxProd !== null ? \`\${maxProd} un.\` : 'N/A'}
                      </td>
                      <td>$\${prepCost.toFixed(2)} MXN</td>
                      <td onClick={e => isEditingMode ? e.preventDefault() : null}>
                        <div className="cost-input-wrapper">
                          <span>$</span>
                          <input type="number" id={\`price-\${p.id}\`} className="inventory-input-number" defaultValue={p.price} disabled={isEditingMode} />
                          <button className="action-btn-small" disabled={isEditingMode} onClick={async () => {`;

content = content.replace(trTarget, trRep);

const footerTarget = `      {showManualAdjustModal && rawItemToAdjust && (`;
const footerRep = `      {editingProduct && (
        <ProductEditorModal 
          product={editingProduct === 'new' ? undefined : editingProduct} 
          rawInventory={rawInventory}
          onSave={handleSaveProduct}
          onClose={() => setEditingProduct(null)}
          onDelete={handleDeleteProduct}
        />
      )}
      
      {showManualAdjustModal && rawItemToAdjust && (`;

content = content.replace(footerTarget, footerRep);

fs.writeFileSync(file, content);
