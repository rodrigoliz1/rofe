const fs = require('fs');
const file = '/Users/rodrigo/.gemini/antigravity/brain/be484d4a-f09b-4f8a-a423-1eda291fcf64/task.md';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/- \[ \] 1/g, '- [x] 1');
content = content.replace(/- \[ \] Añadir/g, '- [x] Añadir');
content = content.replace(/- \[ \] Mostrar en tabla/g, '- [x] Mostrar en tabla');
content = content.replace(/- \[ \] 2/g, '- [x] 2');
content = content.replace(/- \[ \] Consolidar overlays/g, '- [x] Consolidar overlays');
content = content.replace(/- \[ \] Cambiar contenido/g, '- [x] Cambiar contenido');
content = content.replace(/- \[ \] Agregar botón/g, '- [x] Agregar botón');
content = content.replace(/- \[ \] 3/g, '- [x] 3');
content = content.replace(/- \[ \] Reutilizar/g, '- [x] Reutilizar');
content = content.replace(/- \[ \] Estado/g, '- [x] Estado');
content = content.replace(/- \[ \] Modificar endpoint/g, '- [x] Modificar endpoint');
content = content.replace(/- \[ \] Refinar UI/g, '- [x] Refinar UI');

fs.writeFileSync(file, content);
