import React, { useState, useEffect } from 'react';
import type { Product, CustomizationOptions, CartItem } from '../types';
import { ProductIcon } from './Icons';

interface ProductModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

const DEFAULT_CUSTOMIZATION: CustomizationOptions = {
  size: 'regular',
  milk: 'none',
  sweetness: 'none',
  temp: 'hot',
  extraShot: false,
};

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  onClose,
  onAddToCart,
}) => {
  const [customization, setCustomization] = useState<CustomizationOptions>({
    ...DEFAULT_CUSTOMIZATION,
    // Set default milk for milk-based coffees automatically
    milk: product.name.toLowerCase().includes('latte') || product.name.toLowerCase().includes('white') ? 'whole' : 'none',
    // Set default temp based on category
    temp: product.category === 'cold' ? 'iced' : 'hot',
  });

  const [quantity, setQuantity] = useState(1);
  const [totalPrice, setTotalPrice] = useState(product.price);
  const [selectedCustomVariants, setSelectedCustomVariants] = useState<Record<string, string>>({});

  // Calculate pricing based on options selected
  useEffect(() => {
    let base = product.price;

    // Custom Variants
    if (product.custom_variants) {
      product.custom_variants.forEach(group => {
        const selectedOptName = selectedCustomVariants[group.title];
        if (selectedOptName) {
          const opt = group.options.find(o => o.name === selectedOptName);
          if (opt && opt.priceModifier) {
            base += opt.priceModifier;
          }
        }
      });
    }

    // Upgrades
    if (customization.size === 'grande') {
      base += 12; // +$12 MXN for grande
    }
    if (customization.milk === 'avena' || customization.milk === 'almendra') {
      base += 15; // +$15 MXN for vegan milk
    }
    if (customization.extraShot) {
      base += 15; // +$15 MXN for extra espresso shot
    }

    setTotalPrice(base * quantity);
  }, [customization, quantity, product.price]);

  const handleOptionChange = <K extends keyof CustomizationOptions>(
    key: K,
    value: CustomizationOptions[K]
  ) => {
    setCustomization((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleIncrement = () => setQuantity((prev) => prev + 1);
  const handleDecrement = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const handleAdd = () => {
    // Generate a unique ID based on product ID and customization options
    const customizationString = JSON.stringify(customization);
    const uniqueId = `${product.id}-${btoa(customizationString).substring(0, 8)}`;

    const cartItem: CartItem = {
      id: uniqueId,
      product,
      quantity,
      customization,
      totalPrice,
    };

    onAddToCart(cartItem);
  };

  const isCoffeeOrCold = product.category === 'coffee' || product.category === 'cold';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          &times;
        </button>

        <div className="modal-header">
          <div className="modal-icon-wrapper">
            <ProductIcon name={product.icon} size={48} />
          </div>
          <div>
            <h2 className="modal-title">{product.name}</h2>
            <p className="modal-desc">{product.description}</p>
          </div>
        </div>

        <div className="modal-body">
          {isCoffeeOrCold ? (
            <>
              {/* SIZE OPTION */}
              <div className="customization-section">
                <h4 className="section-label">TAMAÑO</h4>
                <div className="options-selector">
                  <button
                    className={`option-btn ${customization.size === 'regular' ? 'active' : ''}`}
                    onClick={() => handleOptionChange('size', 'regular')}
                  >
                    Regular <span className="option-sub">8 oz</span>
                  </button>
                  <button
                    className={`option-btn ${customization.size === 'grande' ? 'active' : ''}`}
                    onClick={() => handleOptionChange('size', 'grande')}
                  >
                    Grande <span className="option-sub">12 oz (+$12)</span>
                  </button>
                </div>
              </div>

              {/* TEMPERATURE (only for coffee that can be iced/hot) */}
              {product.category !== 'cold' && (
                <div className="customization-section">
                  <h4 className="section-label">TEMPERATURA</h4>
                  <div className="options-selector">
                    <button
                      className={`option-btn ${customization.temp === 'hot' ? 'active' : ''}`}
                      onClick={() => handleOptionChange('temp', 'hot')}
                    >
                      Caliente
                    </button>
                    <button
                      className={`option-btn ${customization.temp === 'iced' ? 'active' : ''}`}
                      onClick={() => handleOptionChange('temp', 'iced')}
                    >
                      Con Hielo
                    </button>
                  </div>
                </div>
              )}

              {/* MILK OPTION */}
              {(product.name.toLowerCase().includes('latte') ||
                product.name.toLowerCase().includes('white') ||
                product.name.toLowerCase().includes('capuccino')) && (
                  <div className="customization-section">
                    <h4 className="section-label">TIPO DE LECHE</h4>
                    <div className="options-selector grid-3">
                      <button
                        className={`option-btn ${customization.milk === 'whole' ? 'active' : ''}`}
                        onClick={() => handleOptionChange('milk', 'whole')}
                      >
                        Entera
                      </button>
                      <button
                        className={`option-btn ${customization.milk === 'light' ? 'active' : ''}`}
                        onClick={() => handleOptionChange('milk', 'light')}
                      >
                        Deslactosada
                      </button>
                      <button
                        className={`option-btn ${customization.milk === 'avena' ? 'active' : ''}`}
                        onClick={() => handleOptionChange('milk', 'avena')}
                      >
                        Avena <span className="option-sub">+$15</span>
                      </button>
                      <button
                        className={`option-btn ${customization.milk === 'almendra' ? 'active' : ''}`}
                        onClick={() => handleOptionChange('milk', 'almendra')}
                      >
                        Almendra <span className="option-sub">+$15</span>
                      </button>
                    </div>
                  </div>
                )}

              {/* SWEETENER */}
              <div className="customization-section">
                <h4 className="section-label">ENDULZANTE</h4>
                <div className="options-selector grid-3">
                  <button
                    className={`option-btn ${customization.sweetness === 'none' ? 'active' : ''}`}
                    onClick={() => handleOptionChange('sweetness', 'none')}
                  >
                    Sin azúcar
                  </button>
                  <button
                    className={`option-btn ${customization.sweetness === 'standard' ? 'active' : ''}`}
                    onClick={() => handleOptionChange('sweetness', 'standard')}
                  >
                    Estándar
                  </button>
                  <button
                    className={`option-btn ${customization.sweetness === 'extra' ? 'active' : ''}`}
                    onClick={() => handleOptionChange('sweetness', 'extra')}
                  >
                    Extra
                  </button>
                </div>
              </div>

              {/* EXTRA SHOT TOGGLE */}
              <div className="customization-section toggle-row">
                <div>
                  <h4 className="section-label margin-0">ESPRESSO SHOT EXTRA</h4>
                  <p className="option-sub">Añade una carga extra de café espresso (+ $15 MXN)</p>
                </div>
                <button
                  className={`toggle-btn ${customization.extraShot ? 'active' : ''}`}
                  onClick={() => handleOptionChange('extraShot', !customization.extraShot)}
                >
                  {customization.extraShot ? 'Añadido' : 'Agregar'}
                </button>
              </div>
            </>
          ) : (
            // Bakery Customization (e.g. heated croissant)
            <div className="customization-section">
              <h4 className="section-label">PREPARACIÓN</h4>
              <div className="options-selector">
                <button
                  className={`option-btn ${customization.temp === 'hot' ? 'active' : ''}`}
                  onClick={() => handleOptionChange('temp', 'hot')}
                >
                  Calentar
                </button>
                <button
                  className={`option-btn ${customization.temp === 'iced' ? 'active' : ''}`}
                  onClick={() => handleOptionChange('temp', 'iced')} // we use 'iced' as "no calentar" just to fit model or whatever, let's keep it simple: hot = warmed, iced = room temp
                >
                  Servir al tiempo
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="quantity-selector">
            <button className="qty-btn" onClick={handleDecrement}>
              -
            </button>
            <span className="qty-value">{quantity}</span>
            <button className="qty-btn" onClick={handleIncrement}>
              +
            </button>
          </div>

          <button className="add-to-cart-btn" onClick={handleAdd}>
            <span>Agregar a la Orden</span>
            <span className="price-tag">${totalPrice.toFixed(2)} MXN</span>
          </button>
        </div>
      </div>
    </div>
  );
};
