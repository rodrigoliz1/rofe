const fs = require('fs');
const file = 'src/components/ProductEditorModal.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<button className="close-btn" onClick=\{onClose\}>&times;<\/button>/,
  `<button className="barista-modal-close" onClick={onClose}>&times;</button>`
);

fs.writeFileSync(file, content);
