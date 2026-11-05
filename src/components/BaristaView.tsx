import React, { useState, useEffect } from 'react';
import type { CartItem, Order, OrderStatus } from '../types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { calculateOptimalChange, DENOM_VALUES } from '../utils/cash';
import { apiFetch, publicError } from '../services/api';

interface BaristaViewProps {
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, newStatus: OrderStatus) => Promise<void>;
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

const playNewOrderSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as Window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.15);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch { /* Audio feedback is optional on restricted browsers. */ }
};

function OrderCustomer({ order }: { order: Order }) {
  return <><div className="order-client-name">{order.customerName}{order.channel === 'QR_PICKUP' && <span className="pickup-channel-badge">Pickup · QR</span>}</div>
    {order.channel === 'QR_PICKUP' && <p className="pickup-order-stand">Stand: {order.pickup?.standId ?? 'principal'}</p>}
    {order.notes && <p className="order-prep-note"><strong>Nota para barra:</strong> {order.notes}</p>}
  </>;
}

export const BaristaView: React.FC<BaristaViewProps> = ({ orders, onUpdateOrderStatus, onClearOrders, onClose }) => {
  const actions = useAsyncAction();
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>({});
  const [orderAges, setOrderAges] = useState<Record<string, { className: string; label: string }>>({});
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [receivedDenoms, setReceivedDenoms] = useState<Record<string, number>>({});
  const [cashInventory, setCashInventory] = useState<Record<string, number>>({});
  const [cashError, setCashError] = useState('');
  const [undoReady, setUndoReady] = useState<{ orderId: string; folio: string } | null>(null);

  const loadCashInventory = async () => {
    try {
      const res = await apiFetch('/api/cash/denominations');
      if (res.ok) setCashInventory(await res.json());
    } catch { setCashError('No pudimos consultar las denominaciones disponibles.'); }
  };

  const activeOrdersCount = orders.filter(
    (o) => o.status === 'PAID' || (o.status === 'PENDING_PAYMENT' && o.paymentMethod === 'cash')
  ).length;

  useEffect(() => {
    if (activeOrdersCount > 0) playNewOrderSound();
  }, [activeOrdersCount]);

  useEffect(() => {
    if (selectedOrder && selectedOrder.status === 'PENDING_PAYMENT' && selectedOrder.paymentMethod === 'cash') {
      loadCashInventory();
    }
  }, [selectedOrder]);

  useEffect(() => {
    const updateTimes = () => {
      const now = Date.now();
      const times: Record<string, string> = {};
      const ages: Record<string, { className: string; label: string }> = {};
      orders.forEach((order) => {
        const elapsed = now - new Date(order.createdAt).getTime();
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        times[order.id] = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        ages[order.id] = mins > 15 ? { className: 'age-late', label: 'Demorado' }
          : mins > 8 ? { className: 'age-warning', label: 'Pronto' }
            : { className: '', label: 'Reciente' };
      });
      setElapsedTimes(times);
      setOrderAges(ages);
    };
    updateTimes();
    const interval = setInterval(updateTimes, 15000);
    return () => clearInterval(interval);
  }, [orders]);

  useEffect(() => {
    if (!undoReady) return;
    const timeout = window.setTimeout(() => setUndoReady(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [undoReady]);

  const markReady = async (order: Order) => {
    await onUpdateOrderStatus(order.id, 'READY');
    setUndoReady({ orderId: order.id, folio: order.folio || order.id });
  };

  const undoMarkReady = async () => {
    if (!undoReady) return;
    const operation = undoReady;
    setUndoReady(null);
    try {
      await onUpdateOrderStatus(operation.orderId, 'IN_PREPARATION');
    } catch {
      setCashError(`Ya no fue posible deshacer el pedido ${operation.folio}.`);
    }
  };

  const getCustomizationSummary = (item: CartItem): string => {
    const details = [
      item.customization.size !== 'regular' ? item.customization.size : '',
      item.customization.milk !== 'none' ? `leche ${item.customization.milk}` : '',
      item.customization.sweetness !== 'none' ? item.customization.sweetness : '',
      item.customization.temp === 'iced' ? 'frío' : '',
      item.customization.extraShot ? 'shot extra' : '',
      ...Object.values(item.selectedCustomVariants ?? {}),
    ];
    return details.filter(Boolean).join(' · ');
  };

  const ageState = (order: Order) => {
    return orderAges[order.id] || { className: '', label: 'Reciente' };
  };

  const handleCashPayment = async (order: Order) => {
    const total = order.total;
    const received = Object.entries(receivedDenoms).reduce((sum, [key, qty]) => sum + (DENOM_VALUES[key] || 0) * (qty || 0), 0);
    const changeDue = received - total;

    if (changeDue < 0) {
      setCashError(`Faltan $${Math.abs(changeDue).toFixed(2)} MXN`);
      return;
    }

    const changeResult = calculateOptimalChange(changeDue, Object.fromEntries(Object.keys(DENOM_VALUES).map((key) => [key, (cashInventory[key] || 0) + (receivedDenoms[key] || 0)])));
    if (!changeResult.success) {
      setCashError(changeResult.error || 'No hay suficiente cambio.');
      return;
    }

    try {
      const res = await apiFetch(`/api/orders/${encodeURIComponent(order.id)}/cash-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedDenominations: receivedDenoms,
          changeDenominations: changeResult.changeBreakdown,
          receivedAmount: received,
          changeAmount: changeDue,
        }),
      });
      if (!res.ok) throw new Error(await publicError(res));
      setSelectedOrder(null);
      setReceivedDenoms({});
      setCashError('');
    } catch (cause) {
      setCashError(cause instanceof Error ? cause.message : 'Error al procesar pago.');
    }
  };

  const queueOrders = orders.filter((o) => ['PAID', 'IN_PREPARATION', 'READY'].includes(o.status));
  const cashOrders = orders.filter((o) => o.status === 'PENDING_PAYMENT' && o.paymentMethod === 'cash');
  const historyOrders = orders.filter((o) => o.status === 'COMPLETED' || o.status === 'REFUNDED' || o.status === 'CANCELLED');

  const receivedOrders = queueOrders.filter((o) => o.status === 'PAID');
  const preparingOrders = queueOrders.filter((o) => o.status === 'IN_PREPARATION');
  const readyOrders = queueOrders.filter((o) => o.status === 'READY');

  return (
    <div className="barista-view" id="main-content">
      {actions.error && <p className="inline-feedback error" role="alert">{actions.error}</p>}
      <header className="barista-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <h1 className="barista-title">Barista</h1>
          <div className="barista-tabs">
            <button className={`barista-tab${activeTab === 'queue' ? ' active' : ''}`} onClick={() => setActiveTab('queue')}>
              Cola ({queueOrders.length + cashOrders.length})
            </button>
            <button className={`barista-tab${activeTab === 'history' ? ' active' : ''}`} onClick={() => setActiveTab('history')}>
              Historial
            </button>
          </div>
        </div>
        <button className="barista-close" onClick={onClose}>Salir</button>
      </header>

      {activeTab === 'queue' ? (
        <div className="barista-board">
          {/* COLUMN 1: Received + Cash */}
          <div className="barista-column">
            <h3 className="column-header">
              Pendientes <span className="count">{receivedOrders.length + cashOrders.length}</span>
            </h3>
            <div className="order-cards-list">
              {/* Cash payment orders */}
              {cashOrders.map((order) => {
                const age = ageState(order);
                return (
                  <div key={order.folio || order.id} className={`barista-order-card border-status-received ${age.className}`} onClick={() => setSelectedOrder(order)}>
                    <div className="order-card-header">
                      <span className="order-number-tag">{order.folio || order.id}</span>
                      <span className="time-tag">{elapsedTimes[order.id]} · {age.label}</span>
                    </div>
                    <OrderCustomer order={order} />
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
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-soft)' }}>
                      ${order.total.toFixed(2)} · EFECTIVO
                    </div>
                    <button
                      className="order-action-btn btn-accept"
                      onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); }}
                    >
                      COBRAR
                    </button>
                  </div>
                );
              })}

              {/* Paid orders */}
              {receivedOrders.map((order) => {
                const age = ageState(order);
                return (
                  <div key={order.folio || order.id} className={`barista-order-card border-status-received ${age.className}`} onClick={() => setSelectedOrder(order)}>
                    <div className="order-card-header">
                      <span className="order-number-tag">{order.folio || order.id}</span>
                      <span className="time-tag">{elapsedTimes[order.id]} · {age.label}</span>
                    </div>
                    <OrderCustomer order={order} />
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
                      className="order-action-btn btn-accept"
                      onClick={(e) => { e.stopPropagation(); void actions.run(() => onUpdateOrderStatus(order.id, 'IN_PREPARATION')); }}
                    >
                      ACEPTAR
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 2: Preparing */}
          <div className="barista-column">
            <h3 className="column-header">
              En Preparación <span className="count">{preparingOrders.length}</span>
            </h3>
            <div className="order-cards-list">
              {preparingOrders.map((order) => {
                const age = ageState(order);
                return (
                  <div key={order.folio || order.id} className={`barista-order-card border-status-preparing ${age.className}`} onClick={() => setSelectedOrder(order)}>
                    <div className="order-card-header">
                      <span className="order-number-tag">{order.folio || order.id}</span>
                      <span className="time-tag">{elapsedTimes[order.id]} · {age.label}</span>
                    </div>
                    <OrderCustomer order={order} />
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
                      onClick={(e) => { e.stopPropagation(); void actions.run(() => markReady(order)); }}
                    >
                      LISTO
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 3: Ready */}
          <div className="barista-column">
            <h3 className="column-header">
              Listos <span className="count">{readyOrders.length}</span>
            </h3>
            <div className="order-cards-list">
              {readyOrders.map((order) => {
                const age = ageState(order);
                return (
                  <div key={order.folio || order.id} className={`barista-order-card border-status-ready ${age.className}`} onClick={() => setSelectedOrder(order)}>
                    <div className="order-card-header">
                      <span className="order-number-tag">{order.folio || order.id}</span>
                      <span className="time-tag">{elapsedTimes[order.id]} · {age.label}</span>
                    </div>
                    <OrderCustomer order={order} />
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
                      onClick={(e) => { e.stopPropagation(); void actions.run(() => onUpdateOrderStatus(order.id, 'COMPLETED')); }}
                    >
                      ENTREGAR
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* HISTORY VIEW */
        <div className="barista-history-panel">
          {onClearOrders && historyOrders.length > 0 && (
            <div className="history-actions">
              <button
                className="clear-history-btn"
                onClick={() => {
                  if (window.confirm('¿Limpiar el historial del día? Esta acción borrará permanentemente todos los pedidos completados y cancelados.')) {
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
                  <th>Detalle</th>
                  <th>Hora de Pago</th>
                  <th>Total</th>
                  <th>Método</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historyOrders.map((order) => (
                  <tr key={order.folio || order.id} onClick={() => setSelectedOrder(order)} className="clickable-row">
                    <td className="font-bold">{order.folio || order.id}</td>
                    <td>{order.customerName}</td>
                    <td>{order.items.map((i) => `${i.quantity}x ${i.product.name} (${getCustomizationSummary(i)})`).join(' | ')}</td>
                    <td>{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="font-bold">${order.total.toFixed(2)}</td>
                    <td>
                      <span className={`method-badge ${order.paymentMethod === 'cash' ? 'badge-cash' : 'badge-card'}`}>
                        {order.paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${order.status === 'COMPLETED' ? 'pill-completed' : 'pill-cancelled'}`}>
                        {order.status === 'COMPLETED' ? 'Entregado' : order.status === 'REFUNDED' ? 'Devuelto' : 'Cancelado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {undoReady && (
        <div className="kds-undo" role="status" aria-live="polite">
          <span>Pedido {undoReady.folio} marcado listo.</span>
          <button type="button" onClick={() => void undoMarkReady()}>Deshacer</button>
        </div>
      )}

      {/* Order Detail / Cash Payment Modal */}
      {selectedOrder && (
        <div className="modal-backdrop" onClick={() => { setSelectedOrder(null); setCashError(''); }}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <h2>Pedido {selectedOrder.folio || selectedOrder.id}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: 'var(--space-4)' }}>
              {selectedOrder.customerName} · {new Date(selectedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {selectedOrder.notes && <p className="order-prep-note"><strong>Nota para barra:</strong> {selectedOrder.notes}</p>}

            <div style={{ marginBottom: 'var(--space-6)' }}>
              {selectedOrder.items.map((item) => (
                <div key={item.id} className="checkout-item">
                  <span>{item.quantity}x {item.product.name}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{getCustomizationSummary(item)}</span>
                  <span style={{ fontWeight: 600 }}>${(item.totalPrice || item.product.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="checkout-total-row" style={{ marginBottom: 'var(--space-6)' }}>
              <span>Total</span>
              <span>${selectedOrder.total.toFixed(2)}</span>
            </div>

            {selectedOrder.status === 'PENDING_PAYMENT' && selectedOrder.paymentMethod === 'cash' && (
              <>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Pago en Efectivo</h3>
                <div className="denom-grid" style={{ marginBottom: 'var(--space-4)' }}>
                  {Object.keys(DENOM_VALUES).map((key) => (
                    <div key={key} className="denom-item">
                      <label>{DENOM_LABELS[key]}</label>
                      <input
                        type="number"
                        min="0"
                        value={receivedDenoms[key] ?? 0}
                        onChange={(e) => setReceivedDenoms((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
                  Recibido: ${Object.entries(receivedDenoms).reduce((sum, [key, qty]) => sum + (DENOM_VALUES[key] || 0) * (qty || 0), 0).toFixed(2)}
                  {' · '}
                  Cambio: ${Math.max(0, Object.entries(receivedDenoms).reduce((sum, [key, qty]) => sum + (DENOM_VALUES[key] || 0) * (qty || 0), 0) - selectedOrder.total).toFixed(2)}
                </div>
                {cashError && <div className="inline-feedback error" role="alert">{cashError}</div>}
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button className="btn btn-primary" disabled={actions.busy} onClick={() => void actions.run(() => handleCashPayment(selectedOrder))}>Cobrar</button>
                  <button className="btn btn-secondary" onClick={() => { setSelectedOrder(null); setCashError(''); }}>Cerrar</button>
                </div>
              </>
            )}

            {selectedOrder.status !== 'PENDING_PAYMENT' && (
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className="btn btn-secondary" onClick={() => setSelectedOrder(null)}>Cerrar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
