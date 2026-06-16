import React, { useState, useEffect } from 'react';
import type { Order, OrderStatus } from '../types';

interface BaristaViewProps {
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
  onClearOrders?: () => void;
  onClose: () => void;
}

const DENOM_LABELS: Record<string, string> = {
  bill_1000: 'Billetes de $1000',
  bill_500: 'Billetes de $500',
  bill_200: 'Billetes de $200',
  bill_100: 'Billetes de $100',
  bill_50: 'Billetes de $50',
  bill_20: 'Billetes de $20',
  coin_20: 'Monedas de $20',
  coin_10: 'Monedas de $10',
  coin_5: 'Monedas de $5',
  coin_2: 'Monedas de $2',
  coin_1: 'Monedas de $1',
  coin_0_50: 'Monedas de 50¢',
  coin_0_20: 'Monedas de 20¢',
};

const DENOM_VALUES: Record<string, number> = {
  bill_1000: 1000,
  bill_500: 500,
  bill_200: 200,
  bill_100: 100,
  bill_50: 50,
  bill_20: 20,
  coin_20: 20,
  coin_10: 10,
  coin_5: 5,
  coin_2: 2,
  coin_1: 1,
  coin_0_50: 0.5,
  coin_0_20: 0.2,
};

const playNewOrderSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    // Play an uplifting notifications slide sound (D5 -> A5)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.15); // A5
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {
    console.error("Audio error: ", e);
  }
};

const calculateOptimalChange = (
  changeDue: number,
  availableCoins: Record<string, number>
): { success: boolean; changeBreakdown: Record<string, number>; error?: string } => {
  if (changeDue <= 0) {
    return { success: true, changeBreakdown: {} };
  }

  const denoms = [
    { key: 'bill_1000', value: 1000 },
    { key: 'bill_500', value: 500 },
    { key: 'bill_200', value: 200 },
    { key: 'bill_100', value: 100 },
    { key: 'bill_50', value: 50 },
    { key: 'bill_20', value: 20 },
    { key: 'coin_20', value: 20 },
    { key: 'coin_10', value: 10 },
    { key: 'coin_5', value: 5 },
    { key: 'coin_2', value: 2 },
    { key: 'coin_1', value: 1 },
    { key: 'coin_0_50', value: 0.5 },
    { key: 'coin_0_20', value: 0.2 },
  ];

  let remaining = Math.round(changeDue * 100) / 100;
  const breakdown: Record<string, number> = {};
  const inv = { ...availableCoins };

  for (const d of denoms) {
    const qtyAvailable = inv[d.key] || 0;
    if (qtyAvailable <= 0) continue;

    const countNeeded = Math.floor(remaining / d.value);
    const countToUse = Math.min(countNeeded, qtyAvailable);

    if (countToUse > 0) {
      breakdown[d.key] = countToUse;
      remaining = Math.round((remaining - (countToUse * d.value)) * 100) / 100;
      inv[d.key] -= countToUse;
    }
  }

  if (remaining > 0.05) {
    return {
      success: false,
      changeBreakdown: {},
      error: `Denominaciones insuficientes en caja. Faltaron $${remaining.toFixed(2)} MXN`
    };
  }

  return { success: true, changeBreakdown: breakdown };
};

export const BaristaView: React.FC<BaristaViewProps> = ({
  orders,
  onUpdateOrderStatus,
  onClearOrders,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>({});
  
  // Details and calculator modal state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [receivedDenoms, setReceivedDenoms] = useState<Record<string, number>>({});
  const [cashInventory, setCashInventory] = useState<Record<string, number>>({});

  const getApiUrl = (path: string) => {
    const base = import.meta.env.VITE_API_URL || 
                 (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')
                   ? `http://${window.location.hostname}:3000`
                   : window.location.origin);
    return `${base}${path}`;
  };

  const loadCashInventory = async () => {
    try {
      const res = await fetch(getApiUrl('/api/admin/cash'));
      if (res.ok) {
        setCashInventory(await res.json());
      }
    } catch (e) {
      console.error('Error fetching cash register inventory:', e);
    }
  };

  // Play chime sound when any order to process arrives (paid or cash pending)
  const activeOrdersCount = orders.filter(
    (o) => o.status === 'paid' || o.status === 'pending_cash_payment'
  ).length;

  useEffect(() => {
    if (activeOrdersCount > 0) {
      playNewOrderSound();
    }
  }, [activeOrdersCount]);

  // Load cash drawer when detail modal opens for cash payments
  useEffect(() => {
    if (selectedOrder && selectedOrder.status === 'pending_cash_payment') {
      loadCashInventory();
    }
  }, [selectedOrder]);

  // Update elapsed time display every 15 seconds
  useEffect(() => {
    const updateTimes = () => {
      const times: Record<string, string> = {};
      orders.forEach((order) => {
        const created = new Date(order.createdAt).getTime();
        const diffMs = Date.now() - created;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) {
          times[order.id] = 'Hace unos instantes';
        } else {
          times[order.id] = `Hace ${diffMins} min`;
        }
      });
      setElapsedTimes(times);
    };

    updateTimes();
    const interval = setInterval(updateTimes, 15000);
    return () => clearInterval(interval);
  }, [orders]);

  const queueOrders = orders.filter(
    (o) => o.status === 'paid' || o.status === 'pending_cash_payment' || o.status === 'preparing' || o.status === 'ready'
  );

  const historyOrders = orders.filter(
    (o) => o.status === 'completed' || o.status === 'cancelled'
  );

  const getCustomizationSummary = (item: any) => {
    const parts: string[] = [];
    if (item.product.category === 'bakery') {
      if (item.customization.temp === 'hot') parts.push('Caliente');
      return parts.join(', ');
    }

    parts.push(item.customization.size === 'grande' ? '12oz' : '8oz');
    if (item.product.category !== 'cold') {
      parts.push(item.customization.temp === 'iced' ? 'Helado' : 'Caliente');
    }
    if (item.customization.milk !== 'none') {
      const milkNames = {
        whole: 'Entera',
        light: 'Deslac',
        avena: 'Avena',
        almendra: 'Almendra',
      };
      parts.push(milkNames[item.customization.milk as keyof typeof milkNames]);
    }
    if (item.customization.sweetness !== 'none') {
      parts.push(item.customization.sweetness === 'extra' ? 'Extra Dulce' : 'Dulce');
    }
    if (item.customization.extraShot) {
      parts.push('+1 Shot');
    }
    return parts.join(', ');
  };

  // Cash calculation calculations
  const handleReceivedDenomChange = (denom: string, val: number) => {
    setReceivedDenoms(prev => ({
      ...prev,
      [denom]: Math.max(0, (prev[denom] || 0) + val)
    }));
  };

  const receivedAmount = Object.entries(receivedDenoms).reduce((sum, [denom, qty]) => {
    return sum + qty * (DENOM_VALUES[denom] || 0);
  }, 0);

  const changeDue = selectedOrder ? Math.round((receivedAmount - selectedOrder.total) * 100) / 100 : 0;

  // Add received coins to the inventory for change availability
  const totalDrawerForChange = { ...cashInventory };
  Object.entries(receivedDenoms).forEach(([d, qty]) => {
    totalDrawerForChange[d] = (totalDrawerForChange[d] || 0) + qty;
  });

  const changeOptimalResult = calculateOptimalChange(changeDue, totalDrawerForChange);

  const handleConfirmCashPayment = async () => {
    if (!selectedOrder) return;
    try {
      const res = await fetch(getApiUrl(`/api/orders/${encodeURIComponent(selectedOrder.id)}/cash-payment`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedDenominations: receivedDenoms,
          changeDenominations: changeOptimalResult.changeBreakdown,
          receivedAmount,
          changeAmount: changeDue,
        }),
      });

      if (res.ok) {
        setSelectedOrder(null);
        setReceivedDenoms({});
      } else {
        alert('Error al confirmar pago en el servidor.');
      }
    } catch (e) {
      console.error(e);
      // Offline fallback
      const offlineQueueStr = localStorage.getItem('motocarro_offline_sync');
      if (offlineQueueStr) {
        let offlineQueue = JSON.parse(offlineQueueStr);
        const index = offlineQueue.findIndex((q: any) => q.order.id === selectedOrder.id);
        if (index > -1) {
          offlineQueue[index].order.status = 'paid';
          offlineQueue[index].isPendingPayment = false;
          offlineQueue[index].cashTransaction = {
            type: 'payment',
            amount: receivedAmount,
            description: `Pago en efectivo recibido para orden ${selectedOrder.id}`,
            denominations: receivedDenoms
          };
          if (changeDue > 0) {
            offlineQueue[index].changeTransaction = {
              type: 'change',
              amount: changeDue,
              description: `Cambio devuelto para orden ${selectedOrder.id}`,
              denominations: changeOptimalResult.changeBreakdown
            };
          }
          localStorage.setItem('motocarro_offline_sync', JSON.stringify(offlineQueue));
        }
      }
      
      // Update local state directly so barista can continue working
      onUpdateOrderStatus(selectedOrder.id, 'paid');
      setSelectedOrder(null);
      setReceivedDenoms({});
    }
  };

  // Render detail modal
  const renderDetailModal = () => {
    if (!selectedOrder) return null;

    const isPendingCash = selectedOrder.status === 'pending_cash_payment';
    
    return (
      <div className="barista-modal-backdrop" onClick={() => { setSelectedOrder(null); setReceivedDenoms({}); }}>
        <div className="barista-modal-dialog" onClick={(e) => e.stopPropagation()}>
          <button className="barista-modal-close" onClick={() => { setSelectedOrder(null); setReceivedDenoms({}); }}>&times;</button>
          
          <h3 className="modal-order-title">DETALLES DE PEDIDO {selectedOrder.id}</h3>
          <p className="modal-order-meta">Cliente: <strong>{selectedOrder.customerName}</strong> | Hora: {new Date(selectedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          
          <div className="modal-items-list">
            {selectedOrder.items.map((item: any) => (
              <div key={item.id} className="modal-item-row">
                <span className="modal-item-qty">{item.quantity}x</span>
                <div className="modal-item-info">
                  <span className="modal-item-name">{item.product.name}</span>
                  <span className="modal-item-custom">{getCustomizationSummary(item)}</span>
                </div>
                <span className="modal-item-price">${item.totalPrice.toFixed(2)}</span>
              </div>
            ))}
          </div>
          
          <div className="modal-order-total-row">
            <span>TOTAL DE LA ORDEN:</span>
            <span className="modal-total-value">${selectedOrder.total.toFixed(2)} MXN</span>
          </div>

          {isPendingCash ? (
            <div className="modal-cash-calculator">
              <h4 className="calc-subtitle">Calculadora de Cobro en Efectivo</h4>
              <p className="hint-text">Ingresa las denominaciones recibidas del cliente:</p>
              
              <div className="calc-denom-grid">
                {Object.entries(DENOM_LABELS).map(([denom, label]) => {
                  const labelText = label.split('de ')[1] || label;
                  return (
                    <div key={denom} className="calc-denom-item">
                      <span className="denom-label-small">{denom.includes('bill') ? '💵' : '🪙'} {labelText}</span>
                      <div className="calc-qty-controls">
                        <button className="calc-qty-btn" onClick={() => handleReceivedDenomChange(denom, -1)}>-</button>
                        <span className="calc-qty-display">{receivedDenoms[denom] || 0}</span>
                        <button className="calc-qty-btn" onClick={() => handleReceivedDenomChange(denom, 1)}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="calc-summary-section">
                <div className="calc-summary-row">
                  <span>EFECTIVO RECIBIDO:</span>
                  <span className="text-bold">${receivedAmount.toFixed(2)} MXN</span>
                </div>
                <div className="calc-summary-row">
                  <span>CAMBIO A DEVOLVER:</span>
                  <span className={`text-bold ${changeDue >= 0 ? 'text-accent' : 'text-danger'}`}>
                    {changeDue >= 0 ? `$${changeDue.toFixed(2)}` : `Faltan $${Math.abs(changeDue).toFixed(2)}`} MXN
                  </span>
                </div>
              </div>

              {/* Optimal Change Breakdown */}
              {changeDue > 0 && (
                <div className="change-breakdown-box">
                  <span className="breakdown-title">ENTREGAR CAMBIO COMO:</span>
                  {changeOptimalResult.success ? (
                    <div className="breakdown-pieces">
                      {Object.entries(changeOptimalResult.changeBreakdown).map(([denom, qty]) => {
                        const labelText = DENOM_LABELS[denom].split('de ')[1] || DENOM_LABELS[denom];
                        return (
                          <div key={denom} className="breakdown-piece-row">
                            <span>{denom.includes('bill') ? '💵' : '🪙'} {labelText}</span>
                            <strong>x{qty}</strong>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="breakdown-error">{changeOptimalResult.error}</p>
                  )}
                </div>
              )}

              <button
                className="confirm-cash-payment-btn"
                disabled={changeDue < 0 || (changeDue > 0 && !changeOptimalResult.success) || receivedAmount === 0}
                onClick={handleConfirmCashPayment}
              >
                REGISTRAR PAGO Y MARCAR COMO PAGADO
              </button>
            </div>
          ) : (
            <div className="modal-payment-completed-box">
              <span className={`payment-method-badge ${selectedOrder.paymentMethod === 'cash' ? 'badge-cash' : 'badge-card'}`}>
                Pagado con {selectedOrder.paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'}
              </span>
              <p className="payment-time-hint">Transacción confirmada y almacenada en base de datos.</p>
              
              <div className="modal-actions-bar">
                {selectedOrder.status === 'preparing' && (
                  <button className="modal-action-btn btn-ready" onClick={() => { onUpdateOrderStatus(selectedOrder.id, 'ready'); setSelectedOrder(null); }}>
                    LISTO
                  </button>
                )}
                {selectedOrder.status === 'ready' && (
                  <button className="modal-action-btn btn-complete" onClick={() => { onUpdateOrderStatus(selectedOrder.id, 'completed'); setSelectedOrder(null); }}>
                    ENTREGAR
                  </button>
                )}
                <button className="modal-close-btn" onClick={() => setSelectedOrder(null)}>CERRAR</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="barista-view">
      {/* Detail Modal Overlay */}
      {renderDetailModal()}

      <div className="barista-header">
        <div className="barista-title-row">
          <h2 className="barista-title">PANEL DE CONTROL</h2>
          <span className="motocarro-badge">MOTOCARRO #1</span>
        </div>
        <div className="barista-nav">
          <button
            className={`barista-tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            Cola de Pedidos ({queueOrders.length})
          </button>
          <button
            className={`barista-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Historial del Día ({historyOrders.length})
          </button>
          <button className="barista-exit-btn" onClick={onClose}>
            MODO CLIENTE
          </button>
        </div>
      </div>

      {activeTab === 'queue' ? (
        <div className="barista-board">
          {/* COLUMN 1: PENDING / PAID */}
          <div className="barista-column">
            <h3 className="column-header">PAGADOS ({orders.filter((o) => o.status === 'paid' || o.status === 'pending_cash_payment').length})</h3>
            <div className="order-cards-list">
              {orders
                .filter((o) => o.status === 'paid' || o.status === 'pending_cash_payment')
                .map((order) => {
                  const isCash = order.status === 'pending_cash_payment';
                  return (
                    <div
                      key={order.id}
                      className={`barista-order-card ${isCash ? 'border-status-cash order-cash-warning' : 'border-status-paid'}`}
                      onClick={() => setSelectedOrder(order)}
                    >
                      <div className="order-card-header">
                        <span className="order-number-tag">{order.id}</span>
                        <span className="time-tag">{elapsedTimes[order.id]}</span>
                      </div>
                      <div className="order-client-name">{order.customerName}</div>
                      
                      {isCash && (
                        <div className="cash-payment-badge-alert animate-pulse">
                          💵 Pago en Efectivo: Cobrar ${order.total.toFixed(2)}
                        </div>
                      )}

                      <div className="order-card-items">
                        {order.items.map((item) => (
                          <div key={item.id} className="order-card-item">
                            <span className="item-qty">{item.quantity}x</span>
                            <div className="item-details">
                              <span className="item-name">{item.product.name}</span>
                              <span className="item-custom">{getCustomizationSummary(item)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {isCash ? (
                        <button
                          className="order-action-btn btn-cash-collect"
                          onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); }}
                        >
                          COBRAR EN EFECTIVO
                        </button>
                      ) : (
                        <button
                          className="order-action-btn btn-preparing"
                          onClick={(e) => { e.stopPropagation(); onUpdateOrderStatus(order.id, 'preparing'); }}
                        >
                          PREPARAR
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* COLUMN 2: PREPARING */}
          <div className="barista-column">
            <h3 className="column-header">EN PREPARACIÓN ({orders.filter((o) => o.status === 'preparing').length})</h3>
            <div className="order-cards-list">
              {orders
                .filter((o) => o.status === 'preparing')
                .map((order) => (
                  <div key={order.id} className="barista-order-card border-status-preparing" onClick={() => setSelectedOrder(order)}>
                    <div className="order-card-header">
                      <span className="order-number-tag">{order.id}</span>
                      <span className="time-tag">{elapsedTimes[order.id]}</span>
                    </div>
                    <div className="order-client-name">{order.customerName}</div>
                    
                    <div className="order-card-items">
                      {order.items.map((item) => (
                        <div key={item.id} className="order-card-item">
                          <span className="item-qty">{item.quantity}x</span>
                          <div className="item-details">
                            <span className="item-name">{item.product.name}</span>
                            <span className="item-custom">{getCustomizationSummary(item)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      className="order-action-btn btn-ready"
                      onClick={(e) => { e.stopPropagation(); onUpdateOrderStatus(order.id, 'ready'); }}
                    >
                      LISTO
                    </button>
                  </div>
                ))}
            </div>
          </div>

          {/* COLUMN 3: READY */}
          <div className="barista-column">
            <h3 className="column-header">LISTOS PARA ENTREGA ({orders.filter((o) => o.status === 'ready').length})</h3>
            <div className="order-cards-list">
              {orders
                .filter((o) => o.status === 'ready')
                .map((order) => (
                  <div key={order.id} className="barista-order-card border-status-ready" onClick={() => setSelectedOrder(order)}>
                    <div className="order-card-header">
                      <span className="order-number-tag">{order.id}</span>
                      <span className="time-tag">{elapsedTimes[order.id]}</span>
                    </div>
                    <div className="order-client-name">{order.customerName}</div>
                    
                    <div className="order-card-items text-muted-items">
                      {order.items.map((item) => (
                        <div key={item.id} className="order-card-item">
                          <span className="item-qty">{item.quantity}x</span>
                          <div className="item-details">
                            <span className="item-name">{item.product.name}</span>
                            <span className="item-custom">{getCustomizationSummary(item)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      className="order-action-btn btn-complete"
                      onClick={(e) => { e.stopPropagation(); onUpdateOrderStatus(order.id, 'completed'); }}
                    >
                      ENTREGAR
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : (
        // HISTORY VIEW
        <div className="barista-history-panel">
          {onClearOrders && historyOrders.length > 0 && (
            <div className="history-actions">
              <button
                className="clear-history-btn"
                onClick={() => {
                  if (window.confirm('¿Estás seguro de que deseas limpiar el historial del día? Esta acción borrará permanentemente todos los pedidos completados y cancelados.')) {
                    onClearOrders();
                  }
                }}
              >
                LIMPIAR HISTORIAL DEL DÍA
              </button>
            </div>
          )}
          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Detalle de Productos</th>
                  <th>Hora de Pago</th>
                  <th>Total</th>
                  <th>Método</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historyOrders.map((order) => (
                  <tr key={order.id} onClick={() => setSelectedOrder(order)} className="clickable-row">
                    <td className="font-bold">{order.id}</td>
                    <td>{order.customerName}</td>
                    <td>
                      {order.items.map((i) => `${i.quantity}x ${i.product.name} (${getCustomizationSummary(i)})`).join(' | ')}
                    </td>
                    <td>{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="font-bold">${order.total.toFixed(2)}</td>
                    <td>
                      <span className={`method-badge ${order.paymentMethod === 'cash' ? 'badge-cash' : 'badge-card'}`}>
                        {order.paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${order.status === 'completed' ? 'pill-completed' : 'pill-cancelled'}`}>
                        {order.status === 'completed' ? 'Entregado' : 'Cancelado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
