const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<div className="barista-modal-dialog" onClick=\{e => e\.stopPropagation\(\)\} style=\{\{textAlign: 'center', maxWidth: 450, position: 'relative'\}\}>/g,
  '<div className="barista-modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: \'90%\', maxHeight: \'90vh\', overflowY: \'auto\', textAlign: \'left\' }}>'
);

content = content.replace(
  /<div style=\{\{fontSize: '4rem', marginBottom: 10\}\}>\{quickAddSelection\.name\.match\(\/\[\\p\{Emoji\}\\u200d\]\+\/gu\)\?\.\[0\] \|\| '📦'\}<\/div>\n\s*<h2 style=\{\{color: '#fff', marginBottom: 20, fontSize: '1\.8rem'\}\}>\{quickAddSelection\.name\.replace\(\/\[\\p\{Emoji\}\\u200d\]\+\/gu, ''\)\.trim\(\)\}<\/h2>/g,
  `<div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #444' }}>
                  <div style={{ fontSize: '4rem', background: '#1c1c1c', padding: '10px 20px', borderRadius: 12 }}>{quickAddSelection.name.match(/[\\p{Emoji}\\u200d]+/gu)?.[0] || '📦'}</div>
                  <div>
                    <h2 style={{ color: '#fff', margin: 0, fontSize: '2rem' }}>{quickAddSelection.name.replace(/[\\p{Emoji}\\u200d]+/gu, '').trim()}</h2>
                    <p style={{ color: '#888', margin: '5px 0 0 0', fontSize: '1.1rem' }}>Detalle de Insumo</p>
                  </div>
                </div>`
);

fs.writeFileSync(file, content);
