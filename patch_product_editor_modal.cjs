const fs = require('fs');
const file = 'src/components/ProductEditorModal.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<div className="modal-overlay" style=\{\{ backdropFilter: 'blur\(5px\)', zIndex: 10000 \}\}>/,
  `<div className="barista-modal-backdrop" style={{ backdropFilter: 'blur(5px)', zIndex: 10000 }}>`
);

content = content.replace(
  /<div className="modal-content" style=\{\{ maxWidth: 800, width: '90%', maxHeight: '90vh', overflowY: 'auto' \}\}>/,
  `<div className="barista-modal-dialog" style={{ maxWidth: 800, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>`
);

fs.writeFileSync(file, content);
