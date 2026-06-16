const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<tr key=\{p\.id\}>/g,
  `<tr key={p.id} className={isEditingMode ? 'clickable-row' : ''} onClick={() => { if (isEditingMode) setEditingProduct(p); }}>`
);

fs.writeFileSync(file, content);
