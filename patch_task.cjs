const fs = require('fs');
const file = '/Users/rodrigo/.gemini/antigravity/brain/be484d4a-f09b-4f8a-a423-1eda291fcf64/task.md';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/- \[ \] 4\. Backend/g, '- [x] 4. Backend');
content = content.replace(/- \[ \] Schema SQL/g, '- [x] Schema SQL');
content = content.replace(/- \[ \] Actualizar \`DbAdapter\`/g, '- [x] Actualizar `DbAdapter`');
content = content.replace(/- \[ \] Endpoints/g, '- [x] Endpoints');
content = content.replace(/- \[ \] 5\. Frontend/g, '- [x] 5. Frontend');
content = content.replace(/- \[ \] Modificar pestaña de/g, '- [x] Modificar pestaña de');
content = content.replace(/- \[ \] Formulario para ingresar/g, '- [x] Formulario para ingresar');
content = content.replace(/- \[ \] Resumen Estadístico/g, '- [x] Resumen Estadístico');
content = content.replace(/- \[ \] Historial de Cierres/g, '- [x] Historial de Cierres');

fs.writeFileSync(file, content);
