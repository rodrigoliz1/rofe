import React, { useState } from 'react';
import type { Product } from '../types';
import { ProductIcon } from './Icons';

interface ProductCardImageProps {
  src: string;
  alt: string;
  icon: string;
}

const ProductCardImage: React.FC<ProductCardImageProps> = ({ src, alt, icon }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div className="product-card-icon-wrapper">
        <ProductIcon name={icon} className="product-card-icon" size={40} />
      </div>
    );
  }

  return (
    <div className="product-card-image-wrapper">
      <img
        src={src}
        alt={alt}
        className="product-card-image"
        loading="lazy"
        onError={() => setHasError(true)}
      />
    </div>
  );
};

interface CatalogProps {
  products: Product[];
  selectedCategory: string;
  onSelectCategory: (category: 'all' | 'coffee' | 'cold' | 'bakery') => void;
  onProductClick: (product: Product) => void;
}

export const Catalog: React.FC<CatalogProps> = ({
  products,
  selectedCategory,
  onSelectCategory,
  onProductClick,
}) => {
  const filteredProducts = products.filter(
    (p) => selectedCategory === 'all' || p.category === selectedCategory
  );

  return (
    <div className="catalog-container">
      <div className="catalog-header">
        <h2 className="catalog-title">MENÚ</h2>
        <div className="categories-tabs">
          {(['all', 'coffee', 'cold', 'bakery'] as const).map((cat) => (
            <button
              key={cat}
              className={`category-tab ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => onSelectCategory(cat)}
            >
              {cat === 'all' && 'Todo'}
              {cat === 'coffee' && 'Café Caliente'}
              {cat === 'cold' && 'Bebidas Frías'}
              {cat === 'bakery' && 'Panadería'}
            </button>
          ))}
        </div>
      </div>

      <div className="products-grid">
        {filteredProducts.map((product) => {
          const isDepleted = product.stock !== undefined && product.stock <= 0;
          return (
            <div
              key={product.id}
              className={`product-card ${isDepleted ? 'product-card-depleted' : ''}`}
              onClick={() => {
                if (!isDepleted) {
                  onProductClick(product);
                }
              }}
            >
              <ProductCardImage src={product.image || ''} alt={product.name} icon={product.icon} />
              {isDepleted && <div className="depleted-badge">AGOTADO</div>}
              <div className="product-card-info">
                <h3 className="product-card-name">{product.name}</h3>
                <p className="product-card-desc">{product.description}</p>
              </div>
              <div className="product-card-footer">
                <span className="product-card-price">${product.price.toFixed(2)} MXN</span>
                <span className="product-card-action">
                  {isDepleted ? 'Agotado' : product.customizable ? 'Personalizar' : 'Agregar'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
