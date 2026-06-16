const fs = require('fs');
const file = 'backend/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

const newEndpoints = `

// --- CORTE DE CAJA ---

app.get('/api/admin/closures/stats', async (req, res) => {
  try {
    const closures = await db.getDailyClosures();
    const lastClosureDate = closures.length > 0 ? new Date(closures[0].closed_at).getTime() : 0;
    
    // Get all orders since last closure
    const allOrders = await db.getOrders();
    const ordersSinceLastClosure = allOrders.filter(o => 
      new Date(o.createdAt).getTime() > lastClosureDate && 
      o.status !== 'cancelled' && o.status !== 'rejected'
    );
    
    let total_sales = 0;
    const products_sold: Record<string, number> = {};
    ordersSinceLastClosure.forEach(o => {
      total_sales += o.total;
      o.items.forEach((item: any) => {
        products_sold[item.product.name] = (products_sold[item.product.name] || 0) + item.quantity;
      });
    });

    // Get all transactions since last closure
    const allTx = await db.getTransactionLedger();
    const txSinceLastClosure = allTx.filter(t => 
      t.created_at && new Date(t.created_at).getTime() > lastClosureDate && t.status !== 'deleted'
    );
    
    let total_costs = 0;
    let total_income = 0;
    txSinceLastClosure.forEach(t => {
      if (t.type === 'manual_expense') total_costs += t.amount;
      if (t.type === 'manual_income') total_income += t.amount;
    });

    // Net Profit
    // Income doesn't just include manual_income, it must include total_sales (the cash/card earnings)
    const net_profit = (total_sales + total_income) - total_costs;

    // Current Cash in register
    const cashReg = await db.getCashRegister();
    const values: Record<string, number> = {
      bill_1000: 1000, bill_500: 500, bill_200: 200, bill_100: 100, bill_50: 50, bill_20: 20,
      coin_20: 20, coin_10: 10, coin_5: 5, coin_2: 2, coin_1: 1, coin_0_50: 0.5, coin_0_20: 0.2
    };
    let cash_end = 0;
    Object.entries(cashReg).forEach(([denom, count]) => {
      cash_end += count * (values[denom] || 0);
    });
    
    const cash_start = closures.length > 0 ? closures[0].cash_end : 0;

    res.json({
      last_closure_at: closures.length > 0 ? closures[0].closed_at : null,
      total_sales,
      total_income,
      total_costs,
      net_profit,
      cash_start,
      cash_end,
      products_sold
    });
  } catch (error) {
    console.error('Error fetching closure stats:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/admin/closures', async (req, res) => {
  try {
    const closureData = req.body;
    closureData.closed_at = new Date().toISOString();
    await db.createDailyClosure(closureData);
    res.json({ message: 'Corte de caja registrado exitosamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar corte de caja.' });
  }
});

app.get('/api/admin/closures', async (req, res) => {
  try {
    const closures = await db.getDailyClosures();
    res.json(closures);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo cierres de caja.' });
  }
});

app.listen`;

content = content.replace(`app.listen`, newEndpoints);
fs.writeFileSync(file, content);
