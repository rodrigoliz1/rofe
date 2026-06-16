const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /onClick=\{\(\) => \{\n\s*const val = \(document.getElementById/g,
  `onClick={(e) => { e.stopPropagation();\n                            const val = (document.getElementById`
);

content = content.replace(
  /onClick=\{\(\) => \{\n\s*setEditingRecipeProduct\(p\);/g,
  `onClick={(e) => { e.stopPropagation();\n                            setEditingRecipeProduct(p);`
);

fs.writeFileSync(file, content);
