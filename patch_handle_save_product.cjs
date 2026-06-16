const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /await fetch\(getApiUrl\(endpoint\), \{\n\s*method,\n\s*headers: \{ 'Content-Type': 'application\/json' \},\n\s*body: JSON\.stringify\(pToSave\)\n\s*\}\);\n\s*setEditingProduct\(null\);\n\s*onInventoryUpdate\(\);/g,
  `const res = await fetch(getApiUrl(endpoint), {\n        method,\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify(pToSave)\n      });\n      if (!res.ok) throw new Error(await res.text());\n      setEditingProduct(null);\n      onInventoryUpdate();`
);

fs.writeFileSync(file, content);
