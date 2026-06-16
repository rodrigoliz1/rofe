const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /if \(res\.ok\) \{\n\s*setEditingRecipeProduct\(null\);\n\s*setEditingRecipe\(\{\}\);\n\s*loadAllData\(\);\n\s*\}/g,
  `if (res.ok) {\n        setEditingRecipeProduct(null);\n        setEditingRecipe({});\n        loadAllData();\n        onInventoryUpdate();\n      }`
);

fs.writeFileSync(file, content);
