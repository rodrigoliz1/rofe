const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes("ProductEditorModal")) {
  content = content.replace(
    /import \{ getApiUrl \} from '\.\.\/utils';/,
    `import { getApiUrl } from '../utils';\nimport { ProductEditorModal } from './ProductEditorModal';`
  );
}

const targetState = `  const [activeTab, setActiveTab] = useState<'dashboard' | 'cash' | 'costs' | 'raw_inventory' | 'closure'>('dashboard');`;
const repState = `  const [activeTab, setActiveTab] = useState<'dashboard' | 'cash' | 'costs' | 'raw_inventory' | 'closure'>('dashboard');
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null | 'new'>(null);`;
content = content.replace(targetState, repState);

const targetHandleSave = `  const loadAllData = async () => {`;
const repHandleSave = `
  const handleSaveProduct = async (p: Product, imgFile?: File) => {
    try {
      let finalImageUrl = p.image;
      if (imgFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
        });
        reader.readAsDataURL(imgFile);
        const base64 = await base64Promise;

        const uploadRes = await fetch(getApiUrl('/api/upload-image'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64,
            fileName: imgFile.name,
            mimeType: imgFile.type
          })
        });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          finalImageUrl = url;
        }
      }

      const pToSave = { ...p, image: finalImageUrl };

      const isNew = editingProduct === 'new';
      const method = isNew ? 'POST' : 'PUT';
      const endpoint = isNew ? '/api/products' : \`/api/products/\${p.id}\`;

      await fetch(getApiUrl(endpoint), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pToSave)
      });
      
      setEditingProduct(null);
      onInventoryUpdate(); // Reload products
    } catch (e) {
      console.error(e);
      alert('Error guardando el producto');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await fetch(getApiUrl(\`/api/products/\${id}\`), { method: 'DELETE' });
      setEditingProduct(null);
      onInventoryUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const loadAllData = async () => {`;

content = content.replace(targetHandleSave, repHandleSave);

fs.writeFileSync(file, content);
