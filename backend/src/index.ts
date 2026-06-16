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
app.use(express.urlencoded({ extended: true }));

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
        amount: Math.round(total * 100), // Envia 4500 centavos en vez de 45 pesos
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

// Sync offline orders
app.post('/api/orders/sync', async (req, res) => {
  try {
    const { syncData } = req.body;
    if (!Array.isArray(syncData)) {
      res.status(400).json({ error: 'Payload de sincronización inválido.' });
      return;
    }

    let syncedCount = 0;
    for (const record of syncData) {
      const { order, cashTransaction, changeTransaction } = record;
      if (order) {
        try {
          await db.createOrder(order);
          syncedCount++;
          if (cashTransaction) {
            await db.addCashTransaction(cashTransaction);
          }
          if (changeTransaction) {
            await db.addCashTransaction(changeTransaction);
          }
        } catch (e: any) {
          // If the order already exists, it might throw a duplicate key error. We can ignore it or log it.
          console.warn(`Error al sincronizar orden ${order.id}:`, e.message);
        }
      }
    }

    // Broadcast update so clients refresh
    if (syncedCount > 0) {
      broadcast({ type: 'inventory_updated' });
    }

    res.json({ message: 'Sincronización completada', syncedOrders: syncedCount });
  } catch (error) {
    console.error('Error en sync:', error);
    res.status(500).json({ error: 'Error interno durante sincronización.' });
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
    const type = req.body?.type || req.query?.topic || req.query?.type;

    console.log(`Webhook recibido -> Tipo: ${type}`);

    // --- ESCENARIO 1: Pago desde Terminal Point Smart ---
    if (type === 'point_integration_wh') {
      const pointState = req.body?.state; // 'FINISHED'
      const paymentState = req.body?.payment?.state; // 'approved'
      const orderId = req.body?.additional_info?.external_reference; // '#096'
      const paymentId = req.body?.payment?.id; // 164264977366

      if (pointState === 'FINISHED' && paymentState === 'approved' && orderId) {
        console.log(`Pago físico aprobado para pedido: ${orderId}`);
        
        const orders = await db.getOrders();
        const orderIndex = orders.findIndex((o) => o.id === orderId);
        
        if (orderIndex > -1 && orders[orderIndex].status !== 'paid') {
          await db.updateOrderStatus(orderId, 'paid', paymentId);
          const updatedOrders = await db.getOrders();
          const paidOrder = updatedOrders.find(o => o.id === orderId);

          console.log(`✅ Pedido ${orderId} marcado como PAGADO.`);

          // Log card payment transaction
          if (paidOrder) {
            await db.addCashTransaction({
              type: 'card_payment',
              amount: paidOrder.total,
              description: `Pago con tarjeta (Físico) para orden ${paidOrder.id}`,
              denominations: {}
            });
          }

          // Disparar evento a la web para cerrar el modal
          broadcast({
            type: 'order_paid',
            orderId: orderId,
            order: paidOrder
          });
        }
      }
      else if (pointState === 'CANCELED' || pointState === 'ERROR' || paymentState === 'rejected') {
        console.log(`⚠️ Pago físico rechazado/cancelado para pedido: ${orderId}`);
        
        const orders = await db.getOrders();
        const orderIndex = orders.findIndex((o) => o.id === orderId);
        
        if (orderIndex > -1) {
          // 1. Actualizamos el estado a 'rejected' (o 'failed' si así lo llamaste en CheckoutModal)
          await db.updateOrderStatus(orderId, 'rejected'); 
          
          const updatedOrders = await db.getOrders();
          const rejectedOrder = updatedOrders.find(o => o.id === orderId);

          // 2. Disparamos la actualización normal para que tu CheckoutModal reaccione
          broadcast({
            type: 'order_updated',
            orderId: orderId,
            order: rejectedOrder
          });
        }
      }
    } 
    // --- ESCENARIO 2: Pago tradicional / Fallback ---
    else if (type === 'payment') {
      const paymentId = req.body?.data?.id || req.query?.id || req.query?.['data.id'];
      if (paymentId) {
        const accessToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN || '').replace(/['"]/g, '').trim();

        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (mpResponse.ok) {
          const paymentDetails: any = await mpResponse.json();
          const status = paymentDetails.status;
          const orderId = paymentDetails.external_reference;

          if (status === 'approved' && orderId) {
            const orders = await db.getOrders();
            const orderIndex = orders.findIndex((o) => o.id === orderId);
            
            if (orderIndex > -1 && orders[orderIndex].status !== 'paid') {
              await db.updateOrderStatus(orderId, 'paid', paymentId);
              const updatedOrders = await db.getOrders();
              const paidOrder = updatedOrders.find(o => o.id === orderId);

              console.log(`✅ Pedido ${orderId} marcado como PAGADO (Fallback).`);
              
              if (paidOrder) {
                await db.addCashTransaction({
                  type: 'card_payment',
                  amount: paidOrder.total,
                  description: `Pago con tarjeta (Digital/Fallback) para orden ${paidOrder.id}`,
                  denominations: {}
                });
              }

              broadcast({ type: 'order_paid', orderId: orderId, order: paidOrder });
            }
          }
        }
      }
    }

    // Siempre responder OK (200) para que Mercado Pago no reintente
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

    if (paidOrder && paidOrder.paymentMethod === 'card') {
      await db.addCashTransaction({
        type: 'card_payment',
        amount: paidOrder.total,
        description: `Pago con tarjeta (Simulado) para orden ${paidOrder.id}`,
        denominations: {}
      });
    }

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
app.get('/api/admin/metrics', async (req, res) => {
  try {
    const { startDate, endDate, viewMode } = req.query;

    let orders = await db.getOrders();
    let transactions = await db.getTransactionLedger();
    const inventory = await db.getInventory();
    const register = await db.getCashRegister();

    // Filter by dates if provided
    if (startDate) {
      const start = new Date(startDate as string).getTime();
      orders = orders.filter(o => new Date(o.createdAt).getTime() >= start);
      transactions = transactions.filter(t => new Date(t.created_at!).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate as string).getTime();
      orders = orders.filter(o => new Date(o.createdAt).getTime() <= end);
      transactions = transactions.filter(t => new Date(t.created_at!).getTime() <= end);
    }

    // Cost lookup map
    const costMap: Record<string, number> = {};
    inventory.forEach(i => {
      costMap[i.product_id] = i.cost;
    });

    // 1. Costos de Producción (COGS) basados en órdenes vendidas
    const paidOrders = orders.filter(o => ['paid', 'preparing', 'ready', 'completed'].includes(o.status));
    
    let revenue = 0;
    let costs = 0;
    
    paidOrders.forEach(o => {
      o.items.forEach(item => {
        const unitCost = costMap[item.product.id] || 0;
        costs += unitCost * item.quantity;
      });
    });

    // 2. Ingresos y Gastos desde el Historial de Transacciones (Fuente de Verdad)
    const validTransactions = transactions.filter(t => t.status !== 'deleted');
    validTransactions.forEach(t => {
      if (t.type === 'payment' || t.type === 'card_payment' || t.type === 'manual_income') {
        revenue += t.amount;
      } else if (t.type === 'change') {
        revenue -= t.amount;
      } else if (t.type === 'manual_expense') {
        costs += t.amount;
      } else if (t.type === 'manual_investment' && viewMode === 'inversion') {
        costs += t.amount;
      }
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
      type: type as 'manual_income' | 'manual_expense' | 'manual_investment',
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
app.get('/api/admin/transactions', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let ledger = await db.getTransactionLedger();
    
    if (startDate) {
      const start = new Date(startDate as string).getTime();
      ledger = ledger.filter(t => new Date(t.created_at!).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate as string).getTime();
      ledger = ledger.filter(t => new Date(t.created_at!).getTime() <= end);
    }

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

app.get('/api/admin/inventory', async (_req, res) => {
  try {
    const inventory = await db.getInventory();
    res.json(inventory);
  } catch (error) {
    console.error('Error al obtener inventario:', error);
    res.status(500).json({ error: 'Error al obtener inventario.' });
  }
});

// Update product stock and cost (Legacy)
app.post('/api/admin/inventory', async (req, res) => {
  try {
    const { productId, stock, cost } = req.body;
    if (!productId || stock === undefined || cost === undefined) {
      res.status(400).json({ error: 'Faltan parámetros.' });
      return;
    }

    await db.updateInventory(productId, stock, cost);
    broadcast({ type: 'inventory_updated' });

    res.json({ message: 'Inventario actualizado con éxito.' });
  } catch (error) {
    console.error('Error al actualizar inventario:', error);
    res.status(500).json({ error: 'Error al actualizar inventario.' });
  }
});

// --- NEW V2 ENDPOINTS ---
app.get('/api/products', async (_req, res) => {
  try {
    const products = await db.getProducts();
    res.json(products);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener productos.' });
  }
});

app.post('/api/products/price', async (req, res) => {
  try {
    const { id, price } = req.body;
    await db.updateProductPrice(id, price);
    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Precio actualizado con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar precio.' });
  }
});

app.post('/api/products/recipe', async (req, res) => {
  try {
    const { productId, recipe } = req.body;
    if (!productId || !recipe) {
      res.status(400).json({ error: 'Faltan parámetros.' });
      return;
    }
    await db.updateProductRecipe(productId, recipe);
    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Receta actualizada con éxito.' });
  } catch (error) {
    console.error('Error al actualizar receta:', error);
    res.status(500).json({ error: 'Error al actualizar receta.' });
  }
});

app.get('/api/admin/raw-inventory', async (_req, res) => {
  try {
    const inv = await db.getRawInventory();
    res.json(inv);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener inventario de insumos.' });
  }
});

app.post('/api/admin/raw-inventory', async (req, res) => {
  try {
    const { id, stock, cost } = req.body;
    await db.updateRawInventory(id, stock, cost);
    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Insumo actualizado con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar insumo.' });
  }
});

app.post('/api/admin/raw-inventory/add-item', async (req, res) => {
  try {
    const { id, name, unit, stock, cost } = req.body;
    if (!id || !name || !unit) {
      res.status(400).json({ error: 'Faltan parámetros básicos (id, name, unit).' });
      return;
    }
    await db.createRawInventoryItem({
      id, name, unit,
      stock: stock || 0,
      cost: cost || 0
    });
    
    // If the initial creation includes a cost > 0, we could log it, but let's assume
    // adding an item initially might be just setting up the system unless requested.
    // Actually, user said: "iniciará en ceros todo. Necesito que cada cosa que agregue de ingredientes/insumos, se agregue a costos/egresos."
    // So if they add initial stock/cost, we should log it.
    if (cost > 0) {
      await db.addCashTransaction({
        type: 'manual_expense',
        amount: cost,
        description: `Compra inicial de insumo: ${name} (${stock} ${unit})`,
        denominations: {}
      });
    }

    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Insumo creado con éxito.' });
  } catch (error) {
    console.error('Error al crear insumo:', error);
    res.status(500).json({ error: 'Error al crear insumo.' });
  }
});

app.post('/api/admin/raw-inventory/purchase', async (req, res) => {
  try {
    const { id, addedStock, addedCost } = req.body;
    if (!id || addedStock === undefined || addedCost === undefined) {
      res.status(400).json({ error: 'Faltan parámetros.' });
      return;
    }

    const inv = await db.getRawInventory();
    const item = inv.find(i => i.id === id);
    if (!item) {
      res.status(404).json({ error: 'Insumo no encontrado.' });
      return;
    }

    const newStock = item.stock + addedStock;
    const newCost = item.cost + addedCost;

    await db.updateRawInventory(id, newStock, newCost);

    if (addedCost > 0) {
      await db.addCashTransaction({
        type: 'manual_expense',
        amount: addedCost,
        description: `Compra de insumo: ${item.name} (+${addedStock} ${item.unit})`,
        denominations: {}
      });
    }

    broadcast({ type: 'inventory_updated' });
    res.json({ message: 'Compra registrada con éxito.' });
  } catch (error) {
    console.error('Error al registrar compra:', error);
    res.status(500).json({ error: 'Error al registrar compra.' });
  }
});

// Initialize database and start server
db.initialize().then(() => {
  

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
    const denomsLeft = closureData.denominations_left;
    delete closureData.denominations_left;

    closureData.closed_at = new Date().toISOString();
    await db.createDailyClosure(closureData);

    if (denomsLeft) {
      await db.adjustCashRegister(denomsLeft);
    }

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

app.listen(PORT, () => {
    console.log(`Servidor POS corriendo en puerto ${PORT}`);
  });
}).catch(err => {
  console.error('Error crítico al inicializar la base de datos:', err);
  app.listen(PORT, () => {
    console.log(`Servidor POS corriendo en puerto ${PORT} (fallback sin DB)`);
  });
});
