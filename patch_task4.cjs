const fs = require('fs');
const file = '/Users/rodrigo/.gemini/antigravity/brain/be484d4a-f09b-4f8a-a423-1eda291fcf64/task.md';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/- \[ \] 2\. Modo Edición UI/g, '- [x] 2. Modo Edición UI');
content = content.replace(/- \[ \] Switch "Modo Edición"/g, '- [x] Switch "Modo Edición"');
content = content.replace(/- \[ \] Modal \`ProductEditorModal\`/g, '- [x] Modal `ProductEditorModal`');
content = content.replace(/- \[ \] Implementar Lógica de subida de imágenes/g, '- [x] Implementar Lógica de subida de imágenes');
content = content.replace(/- \[ \] 3\. Ventana de Cobro/g, '- [x] 3. Ventana de Cobro');
content = content.replace(/- \[ \] Adaptar la UI para mostrar y seleccionar/g, '- [x] Adaptar la UI para mostrar y seleccionar');
content = content.replace(/- \[ \] Ajustar el cálculo de precios/g, '- [x] Ajustar el cálculo de precios');

fs.writeFileSync(file, content);
