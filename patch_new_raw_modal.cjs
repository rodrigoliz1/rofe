const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<div className="barista-modal-dialog" onClick=\{e => e\.stopPropagation\(\)\}>\n\s*<h2 style=\{\{color: '#ea580c', marginBottom: 20\}\}>Nuevo Insumo<\/h2>/g,
  `<div className="barista-modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: '90%', maxHeight: '90vh', overflowY: 'auto', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #444' }}>
              <div style={{ fontSize: '3rem', background: '#1c1c1c', padding: '10px 20px', borderRadius: 12 }}>📦</div>
              <div>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '2rem' }}>Añadir Nuevo Insumo</h2>
                <p style={{ color: '#888', margin: '5px 0 0 0', fontSize: '1.1rem' }}>Ingresa los detalles para agregarlo al inventario.</p>
              </div>
            </div>`
);

fs.writeFileSync(file, content);
