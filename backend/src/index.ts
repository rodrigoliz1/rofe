import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { db } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*' // Allow all origins for easier PWA access on local network
}));
app.use(express.json());

// --- Server-Sent Events (SSE) Client List ---
let clients: express.Response[] = [];

// Broadcast helper
const broadcast = (data: any) => {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => {
    try {
      client.write(message);
    } catch (err) {
      console.error('Error writing to client stream:', err);
    }
  });
};

// --- SSE Endpoint ---
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Keep-alive heartbeat
  res.write('data: {"type":"connected"}\n\n');

  clients.push(res);
  console.log(`Cliente SSE conectado. Total conectados: ${clients.length}`);

  req.on('close', () => {
    clients = clients.filter((client) => client !== res);
    console.log(`Cliente SSE desconectado. Total conectados: ${clients.length}`);
  });
});

// --- API Routes ---

// Get active orders (Barista View)
app.get('/api/orders', async (_req, res) => {
  try {
    const orders = await db.getOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({ error: 'Error al obtener pedidos.' });
  }
});

// Create new order & trigger Mercado Pago Point or Cash flow
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, items, total, paymentMethod } = req.body;

    if (!customerName || !items || !total || !paymentMethod) {
       res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
       return;
    }

    // Generate neat order ID (e.g. #042)
    const randomNum = Math.floor(Math.random() * 90) + 10;
    const orderId = `#0${randomNum}`;

    // Create Order object
    const newOrder = {
      id: orderId,
      customerName,
      items,
      total,
      status: paymentMethod === 'cash' ? 'pending_cash_payment' : 'pending_payment',
      paymentMethod: paymentMethod as 'card' | 'cash',
      createdAt: new Date().toISOString(),
    };

    if (paymentMethod === 'cash') {
      // Save directly to database
      await db.createOrder(newOrder);
      console.log(`Pedido en efectivo ${orderId} creado para ${customerName}.`);
      
      // Broadcast new order to barista
      broadcast({
        type: 'order_updated',
        orderId,
        order: newOrder
      });
      broadcast({ type: 'inventory_updated' });

      res.status(201).json({
        order: newOrder,
        mode: 'cash'
      });
      return;
    }

    // --- Card Payment (Mercado Pago Point) ---
    // Forzamos a leer como string y quitamos comillas accidentales
    const accessToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN || '').replace(/['"]/g, '').trim();
    const deviceId = String(process.env.POINT_DEVICE_ID || '').replace(/['"]/g, '').trim();

    console.log(`[DEBUG MP] Intentando leer Token: ${accessToken ? 'Existe (oculto)' : 'FALTA'} | Device: ${deviceId}`);

    // Check configuration
    if (!accessToken || !deviceId || accessToken.includes('tu_access_token')) {
      console.warn('Backend corriendo en modo simulación (falta configurar Mercado Pago en .env).');
      
      // Save order in pending_payment state
      await db.createOrder(newOrder);

      res.status(201).json({
        order: newOrder,
        mode: 'simulation',
        message: 'Advertencia: Servidor sin credenciales reales. Corriendo en modo de simulación.'
      });
      return;
    }

    console.log(`Enviando orden ${orderId} a Mercado Pago para terminal ${deviceId}...`);

    // Call Mercado Pago Point Cloud API (Payment Intents)
    const mpResponse = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}/payment-intents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-idempotency-key': `order-${orderId}-${Date.now()}`
      },
      body: JSON.stringify({
        amount: total,
        additional_info: {
          external_reference: orderId,
          print_on_terminal: true
        }
      })
    });

    const mpData: any = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('Error al comunicarse con Mercado Pago:', mpData);
      res.status(502).json({
        error: 'Error de respuesta de la terminal de Mercado Pago.',
        details: mpData
      });
      return;
    }

    // Store payment intent ID inside the order for tracking
    const orderWithIntent = {
      ...newOrder,
      paymentIntentId: mpData.id
    };
    await db.createOrder(orderWithIntent);

    console.log(`Intención de pago creada con éxito. ID: ${mpData.id}. Esperando tarjeta...`);

    res.status(201).json({
      order: orderWithIntent,
      mode: 'production',
      paymentIntent: mpData
    });
  } catch (error) {
    console.error('Error al procesar la orden:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Update order status (Barista View actions)
app.post('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await db.updateOrderStatus(id, status);
    const orders = await db.getOrders();
    const updatedOrder = orders.find(o => o.id === id);

    if (!updatedOrder) {
       res.status(404).json({ error: 'Pedido no encontrado.' });
       return;
    }

    console.log(`Estado del pedido ${id} actualizado a: ${status}`);

    // Broadcast state change to all clients
    broadcast({
      type: 'order_updated',
      orderId: id,
      order: updatedOrder
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar estado.' });
  }
});

// Process cash payment confirmation from barista view
app.post('/api/orders/:id/cash-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { receivedDenominations, changeDenominations, receivedAmount, changeAmount } = req.body;

    if (!receivedDenominations || !changeDenominations || receivedAmount === undefined || changeAmount === undefined) {
      res.status(400).json({ error: 'Faltan parámetros de denominación.' });
      return;
    }

    // Update order status to paid
    await db.updateOrderStatus(id, 'paid', `cash-payment-${Date.now()}`);
    const orders = await db.getOrders();
    const updatedOrder = orders.find(o => o.id === id);

    if (!updatedOrder) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }

    // 1. Add customer payment transaction
    await db.addCashTransaction({
      type: 'payment',
      amount: receivedAmount,
      description: `Pago en efectivo recibido para orden ${id}`,
      denominations: receivedDenominations
    });

    // 2. Add change transaction (if any change was given)
    if (changeAmount > 0) {
      await db.addCashTransaction({
        type: 'change',
        amount: changeAmount,
        description: `Cambio devuelto para orden ${id}`,
        denominations: changeDenominations
      });
    }

    console.log(`[EFECTIVO] Pedido ${id} cobrado: Recibido $${receivedAmount}, Cambio $${changeAmount}.`);

    // Broadcast update to all clients
    broadcast({
      type: 'order_paid',
      orderId: id,
      order: updatedOrder
    });
    broadcast({ type: 'cash_updated' });

    res.json({ message: 'Pago en efectivo registrado con éxito.', order: updatedOrder });
  } catch (error) {
    console.error('Error al registrar pago en efectivo:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Webhook endpoint for Mercado Pago Point (Cards)
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    const { action, data, type } = req.body;

    console.log(`Webhook recibido de Mercado Pago: action=${action}, type=${type}, resource_id=${data?.id}`);

    if (type === 'payment' && data && data.id) {
      const paymentId = data.id;
      const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!mpResponse.ok) {
        console.error(`Error al consultar detalles de pago para id ${paymentId}`);
        res.sendStatus(502);
        return;
      }

      const paymentDetails: any = await mpResponse.json();
      const status = paymentDetails.status;
      const orderId = paymentDetails.external_reference;

      console.log(`Pago ${paymentId} tiene estado: ${status} para pedido: ${orderId}`);

      if (status === 'approved' && orderId) {
        const orders = await db.getOrders();
        const orderIndex = orders.findIndex((o) => o.id === orderId);
        
        if (orderIndex > -1 && orders[orderIndex].status !== 'paid') {
          await db.updateOrderStatus(orderId, 'paid', paymentId);
          const updatedOrders = await db.getOrders();
          const paidOrder = updatedOrders.find(o => o.id === orderId);

          console.log(`Pedido ${orderId} marcado como PAGADO.`);

          // Broadcast payment success to clients
          broadcast({
            type: 'order_paid',
            orderId: orderId,
            order: paidOrder
          });
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error al procesar webhook:', error);
    res.status(500).send('Error');
  }
});

// Local simulation endpoint for manual payment confirmation (testing without webhook tunnel)
app.post('/api/orders/:id/simulate-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const formattedId = id.startsWith('#') ? id : `#${id}`;

    await db.updateOrderStatus(formattedId, 'paid', `sim-payment-${Date.now()}`);
    const orders = await db.getOrders();
    const paidOrder = orders.find(o => o.id === formattedId);

    if (!paidOrder) {
       res.status(404).json({ error: 'Pedido no encontrado.' });
       return;
    }

    console.log(`[SIMULACIÓN] Pedido ${paidOrder.id} marcado como PAGADO manualmente.`);

    // Broadcast status to clients
    broadcast({
      type: 'order_paid',
      orderId: paidOrder.id,
      order: paidOrder
    });

    res.json({ message: 'Pago simulado con éxito.', order: paidOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en simulación.' });
  }
});

// Clear orders endpoint (for convenience / start new day)
app.post('/api/orders/clear', async (_req, res) => {
  try {
    await db.clearOrders();
    broadcast({ type: 'clear_all' });
    console.log('Todos los pedidos borrados.');
    res.json({ message: 'Todos los pedidos borrados.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al borrar pedidos.' });
  }
});

// --- Admin Endpoints ---

// Get administrative dashboard metrics
app.get('/api/admin/metrics', async (_req, res) => {
  try {
    const orders = await db.getOrders();
    const inventory = await db.getInventory();
    const register = await db.getCashRegister();
    const transactions = await db.getTransactionLedger();

    // Cost lookup map
    const costMap: Record<string, number> = {};
    inventory.forEach(i => {
      costMap[i.product_id] = i.cost;
    });

    // Filter orders that are paid or completed
    const paidOrders = orders.filter(o => ['paid', 'preparing', 'ready', 'completed'].includes(o.status));
    
    let revenue = 0;
    let costs = 0;
    paidOrders.forEach(o => {
      revenue += o.total;
      o.items.forEach(item => {
        const unitCost = costMap[item.product.id] || 0;
        costs += unitCost * item.quantity;
      });
    });

    // Calculate cash in register
    const values: Record<string, number> = {
      bill_1000: 1000, bill_500: 500, bill_200: 200, bill_100: 100, bill_50: 50, bill_20: 20,
      coin_20: 20, coin_10: 10, coin_5: 5, coin_2: 2, coin_1: 1, coin_0_50: 0.5, coin_0_20: 0.2
    };
    let cashInRegister = 0;
    Object.entries(register).forEach(([denom, count]) => {
      cashInRegister += count * (values[denom] || 0);
    });

    res.json({
      revenue,
      costs,
      profit: Math.max(0, revenue - costs),
      cashInRegister,
      transactionsCount: transactions.length
    });
  } catch (error) {
    console.error('Error al calcular métricas:', error);
    res.status(500).json({ error: 'Error interno al obtener métricas.' });
  }
});

// Get cash register denominations counts
app.get('/api/admin/cash', async (_req, res) => {
  try {
    const register = await db.getCashRegister();
    res.json(register);
  } catch (error) {
    console.error('Error al obtener arqueo de caja:', error);
    res.status(500).json({ error: 'Error al obtener caja.' });
  }
});

// Set starting cash or adjust register counts
app.post('/api/admin/cash/adjust', async (req, res) => {
  try {
    const { denominations } = req.body;
    if (!denominations) {
       res.status(400).json({ error: 'Faltan parámetros.' });
       return;
    }

    await db.adjustCashRegister(denominations);
    broadcast({ type: 'cash_updated' });

    res.json({ message: 'Arqueo de caja ajustado con éxito.' });
  } catch (error) {
    console.error('Error al ajustar caja:', error);
    res.status(500).json({ error: 'Error al ajustar caja.' });
  }
});

// Record a manual cash movement (Income / Expense)
app.post('/api/admin/cash/transaction', async (req, res) => {
  try {
    const { type, amount, description, denominations } = req.body;
    if (!type || amount === undefined || !description) {
       res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
       return;
    }

    await db.addCashTransaction({
      type: type as 'manual_income' | 'manual_expense',
      amount,
      description,
      denominations: denominations || {}
    });
    broadcast({ type: 'cash_updated' });

    res.json({ message: 'Movimiento de caja registrado con éxito.' });
  } catch (error) {
    console.error('Error al registrar transacción:', error);
    res.status(500).json({ error: 'Error al registrar transacción.' });
  }
});

// Get manual cash ledger transactions
app.get('/api/admin/transactions', async (_req, res) => {
  try {
    const ledger = await db.getTransactionLedger();
    res.json(ledger);
  } catch (error) {
    console.error('Error al obtener historial de movimientos:', error);
    res.status(500).json({ error: 'Error al obtener movimientos.' });
  }
});

// Audit a cash transaction (modify or delete)
app.post('/api/admin/transactions/:id/audit', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, auditReason, newAmount } = req.body;

    if (!status || !auditReason) {
       res.status(400).json({ error: 'Faltan parámetros de auditoría (status, auditReason).' });
       return;
    }

    await db.updateCashTransaction(parseInt(id, 10), status, auditReason, newAmount);
    broadcast({ type: 'cash_updated' });
    res.json({ message: 'Movimiento auditado con éxito.' });
  } catch (error) {
    console.error('Error al auditar transacción:', error);
    res.status(500).json({ error: 'Error al auditar.' });
  }
});

// Get bakery batches
app.get('/api/admin/bakery-batches', async (_req, res) => {
  try {
    const batches = await db.getBakeryBatches();
    res.json(batches);
  } catch (error) {
    console.error('Error al obtener lotes de panadería:', error);
    res.status(500).json({ error: 'Error al obtener lotes.' });
  }
});

// Add bakery batch
app.post('/api/admin/bakery-batches', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || !quantity) {
      res.status(400).json({ error: 'Faltan parámetros (productId, quantity).' });
      return;
    }

    const addedAt = new Date();
    const expiresAt = new Date(addedAt.getTime() + 48 * 60 * 60 * 1000); // 48 hours later

    await db.addBakeryBatch({
      product_id: productId,
      quantity,
      added_at: addedAt.toISOString(),
      expires_at: expiresAt.toISOString()
    });
    
    // Auto-update inventory as well
    const inventory = await db.getInventory();
    const currentItem = inventory.find(i => i.product_id === productId);
    const newStock = (currentItem?.stock || 0) + quantity;
    await db.updateInventory(productId, newStock, currentItem?.cost || 0);

    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Lote de panadería registrado.' });
  } catch (error) {
    console.error('Error al registrar lote:', error);
    res.status(500).json({ error: 'Error al registrar lote.' });
  }
});

// Get all inventory stock levels and costs
app.get('/api/admin/inventory', async (_req, res) => {
  try {
    const inventory = await db.getInventory();
    res.json(inventory);
  } catch (error) {
    console.error('Error al obtener inventario:', error);
    res.status(500).json({ error: 'Error al obtener inventario.' });
  }
});

// Modify stock level / unit cost for a menu item
app.post('/api/admin/inventory', async (req, res) => {
  try {
    const { productId, stock, cost } = req.body;
    if (!productId || stock === undefined || cost === undefined) {
       res.status(400).json({ error: 'Faltan parámetros.' });
       return;
    }

    await db.updateInventory(productId, stock, cost);
    broadcast({ type: 'inventory_updated' });

    res.json({ message: 'Inventario de producto actualizado con éxito.' });
  } catch (error) {
    console.error('Error al actualizar inventario:', error);
    res.status(500).json({ error: 'Error al actualizar inventario.' });
  }
});

// Initialize database and start server
db.initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor POS corriendo en puerto ${PORT}`);
  });
}).catch(err => {
  console.error('Error crítico al inicializar la base de datos:', err);
  app.listen(PORT, () => {
    console.log(`Servidor POS corriendo en puerto ${PORT} (fallback sin DB)`);
  });
});
