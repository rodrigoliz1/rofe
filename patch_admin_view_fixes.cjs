const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes("import { ProductEditorModal }")) {
  content = content.replace(
    /import \{ BarChart/,
    `import { ProductEditorModal } from './ProductEditorModal';\nimport { BarChart`
  );
}

fs.writeFileSync(file, content);
