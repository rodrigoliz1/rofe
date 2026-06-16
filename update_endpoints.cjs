const fs = require('fs');

const file = 'backend/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `app.get('/api/products', async (_req, res) => {
  try {
    const products = await db.getProducts();
    res.json(products);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});`;

const rep = `app.get('/api/products', async (_req, res) => {
  try {
    const products = await db.getProducts();
    res.json(products);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const p = req.body;
    if (!p.id) p.id = Date.now().toString(); // Fallback if no ID generated
    await db.createProduct(p);
    res.json(p);
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    await db.updateProduct(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await db.deleteProduct(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});`;

content = content.replace(target, rep);

fs.writeFileSync(file, content);
