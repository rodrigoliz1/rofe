const fs = require('fs');
const file = '/Users/rodrigo/.gemini/antigravity/brain/be484d4a-f09b-4f8a-a423-1eda291fcf64/task.md';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/- \[ \] Añadir \`custom_variants\`/g, '- [x] Añadir `custom_variants`');
content = content.replace(/- \[ \] Escribir script \`supabase_schema_v4.sql\`/g, '- [x] Escribir script `supabase_schema_v4.sql`');
content = content.replace(/- \[ \] Crear métodos \`createProduct\`/g, '- [x] Crear métodos `createProduct`');
content = content.replace(/- \[ \] Crear endpoints correspondientes/g, '- [x] Crear endpoints correspondientes');

fs.writeFileSync(file, content);
