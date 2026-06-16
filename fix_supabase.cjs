const fs = require('fs');
const file = 'backend/src/supabaseAdapter.ts';
let content = fs.readFileSync(file, 'utf8');

const appendedPart = `}

  // Daily Closures methods`;
  
if (content.includes(appendedPart)) {
  content = content.replace(appendedPart, `  // Daily Closures methods`);
  content = content + `\n}\n`;
  fs.writeFileSync(file, content);
}
