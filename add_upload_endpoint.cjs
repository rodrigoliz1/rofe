const fs = require('fs');

const file = 'backend/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `app.get('/api/products',`;

const rep = `// Image Upload
app.post('/api/upload-image', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { fileBase64, fileName, mimeType } = req.body;
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: 'Faltan datos de la imagen' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    
    // Asumimos que db tiene acceso a la instancia de supabase si es SupabaseDbAdapter
    // Dado que db.ts abstrae esto, podemos añadir una función en DbAdapter o manejarlo directamente
    // si exportamos supabase desde algun lado. Pero vamos a añadir la función a db.ts
    const url = await db.uploadProductImage(fileName, buffer, mimeType);
    res.json({ url });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Error al subir la imagen' });
  }
});

app.get('/api/products',`;

content = content.replace(target, rep);

fs.writeFileSync(file, content);
