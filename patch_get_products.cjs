const fs = require('fs');
const file = 'backend/src/supabaseAdapter.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /customizable: row\.customizable,\n\s*image: row\.image,\n\s*recipe: row\.recipe,/g,
  `customizable: row.customizable,
      image: row.image,
      recipe: row.recipe,
      custom_variants: row.custom_variants || [],`
);

fs.writeFileSync(file, content);
