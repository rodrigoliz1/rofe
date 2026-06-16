const fs = require('fs');
const file = 'backend/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `app.post('/api/admin/closures', async (req, res) => {
  try {
    const closureData = req.body;
    closureData.closed_at = new Date().toISOString();
    await db.createDailyClosure(closureData);
    res.json({ message: 'Corte de caja registrado exitosamente.' });
  } catch (error) {`;

const rep = `app.post('/api/admin/closures', async (req, res) => {
  try {
    const closureData = req.body;
    const denomsLeft = closureData.denominations_left;
    delete closureData.denominations_left;

    closureData.closed_at = new Date().toISOString();
    await db.createDailyClosure(closureData);

    if (denomsLeft) {
      await db.adjustCashRegister(denomsLeft);
    }

    res.json({ message: 'Corte de caja registrado exitosamente.' });
  } catch (error) {`;

content = content.replace(target, rep);

fs.writeFileSync(file, content);
