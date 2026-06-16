const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `    </div>
  );
};`;

const rep = `
      {editingProduct && (
        <ProductEditorModal 
          product={editingProduct === 'new' ? undefined : editingProduct} 
          rawInventory={rawInventory}
          onSave={handleSaveProduct}
          onClose={() => setEditingProduct(null)}
          onDelete={handleDeleteProduct}
        />
      )}

    </div>
  );
};`;

if (!content.includes("<ProductEditorModal")) {
  content = content.replace(target, rep);
  fs.writeFileSync(file, content);
}

// Fix ProductEditorModal types
const pemFile = 'src/components/ProductEditorModal.tsx';
let pemContent = fs.readFileSync(pemFile, 'utf8');
pemContent = pemContent.replace(
  /import \{ Product, CustomVariantGroup, CustomVariantOption \} from '\.\.\/types';/,
  `import type { Product, CustomVariantGroup } from '../types';`
);
fs.writeFileSync(pemFile, pemContent);

