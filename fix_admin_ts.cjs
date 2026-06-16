const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(`import type { Product, Order } from '../types';`, `import type { Product } from '../types';`);
content = content.replace(`const [invRes, rawRes, regRes, txRes, alertsRes, bakeryRes, closureStatsRes, closureHistoryRes, mRes] = await Promise.all([`, `const [, rawRes, regRes, txRes, , bakeryRes, closureStatsRes, closureHistoryRes, mRes] = await Promise.all([`);

fs.writeFileSync(file, content);
