const fs = require('fs');
const file = 'src/types.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `  customization: CustomizationOptions;
  totalPrice: number;`;
const rep = `  customization: CustomizationOptions;
  selectedCustomVariants?: Record<string, string>; // title -> optionName
  totalPrice: number;`;

content = content.replace(target, rep);
fs.writeFileSync(file, content);
