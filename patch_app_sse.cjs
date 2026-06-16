const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /\} else if \(data\.type === 'inventory_updated'\) \{\n\s*loadInventory\(\);\n\s*\}/g,
  `} else if (data.type === 'inventory_updated') {\n          loadProducts();\n        }`
);

fs.writeFileSync(file, content);
