import React from 'react';
import type { CartItem } from '../types';

interface CartProps {
  cart: CartItem[];
  onRemoveItem: (id: string) => void;
  onUpdateQty: (id: string, qty: number) => void;
  onCheckout: () => void;
  onCancelOrder: () => void;
}

export const Cart: React.FC<CartProps> = ({
  cart,
  onRemoveItem,
  onUpdateQty,
  onCheckout,
  onCancelOrder,
}) => {
  const subtotal = cart.reduce((acc, item) => acc + item.totalPrice, 0);

  const getCustomizationSummary = (item: CartItem) => {
    const parts: string[] = [];
    if (item.product.category === 'bakery') {
      if (item.customization.temp === 'hot') parts.push('Caliente');
      else parts.push('Al tiempo');
      return parts.join(', ');
    }

    // Size
    parts.push(item.customization.size === 'grande' ? 'Grande (12oz)' : 'Regular (8oz)');
    
    // Temp
    if (item.product.category !== 'cold') {
      parts.push(item.customization.temp === 'iced' ? 'Con Hielo' : 'Caliente');
    }

    // Milk
    if (item.customization.milk !== 'none') {
      const milkNames = {
        whole: 'Leche Entera',
        light: 'Deslactosada',
        avena: 'Leche de Avena',
        almendra: 'Leche de Almendra',
      };
      parts.push(milkNames[item.customization.milk as keyof typeof milkNames]);
    }

    // Sweetness
    if (item.customization.sweetness !== 'none') {
      const sweetNames = {
        standard: 'Endulzado Estándar',
        extra: 'Extra Dulce',
      };
      parts.push(sweetNames[item.customization.sweetness as keyof typeof sweetNames]);
    }

    // Extra shot
    if (item.customization.extraShot) {
      parts.push('+1 Shot Espresso');
    }

    return parts.join(', ');
  };

  return (
    <div className="cart-sidebar">
      <div className="cart-header">
        <h3 className="cart-title">TU PEDIDO</h3>
        {cart.length > 0 && (
          <button className="clear-order-btn" onClick={onCancelOrder}>
            Cancelar
          </button>
        )}
      </div>

      <div className="cart-items-wrapper">
        {cart.length === 0 ? (
          <div className="empty-cart">
            <svg
              className="empty-cart-icon"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2" strokeLinecap="round" />
              <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="empty-cart-title">Comienza tu orden</p>
            <p className="empty-cart-desc">Selecciona productos del menú de la izquierda</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="cart-item">
              <div className="cart-item-info">
                <div className="cart-item-header">
                  <h4 className="cart-item-name">{item.product.name}</h4>
                  <span className="cart-item-price">${item.totalPrice.toFixed(2)}</span>
                </div>
                <p className="cart-item-customization">{getCustomizationSummary(item)}</p>
              </div>

              <div className="cart-item-controls">
                <div className="cart-item-qty">
                  <button
                    className="cart-qty-btn"
                    onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                  >
                    -
                  </button>
                  <span className="cart-qty-value">{item.quantity}</span>
                  <button
                    className="cart-qty-btn"
                    onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <button className="cart-remove-btn" onClick={() => onRemoveItem(item.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cart-footer">
        <div className="cart-summary-row">
          <span className="summary-label">Total a pagar:</span>
          <span className="summary-value">${subtotal.toFixed(2)} MXN</span>
        </div>
        <button
          className="checkout-btn"
          disabled={cart.length === 0}
          onClick={onCheckout}
        >
          <span>PAGAR CON TARJETA</span>
          <svg
            className="checkout-arrow"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
};
