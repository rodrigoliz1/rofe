const fs = require('fs');
const file = 'src/components/ProductModal.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const isCoffeeOrCold = product\.category === 'coffee' || product\.category === 'cold';/g,
  "const isCoffeeOrCold = (product.category === 'coffee' || product.category === 'cold') && product.customizable !== false;"
);

fs.writeFileSync(file, content);
