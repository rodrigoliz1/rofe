import React, { useState } from 'react';
import type { Product } from '../types';
import { ProductIcon } from './Icons';
import { apiUrl } from '../services/api';
import { UiIcon } from './UiIcon';

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
        src={src.startsWith('/api/') ? apiUrl(src) : src}
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
  loading: boolean;
  onRetry: () => void;
  selectedCategory: string;
  onSelectCategory: (category: 'all' | 'coffee' | 'cold' | 'bakery') => void;
  onProductClick: (product: Product) => void;
}

export const Catalog: React.FC<CatalogProps> = ({
  products, loading, onRetry,
  selectedCategory,
  onSelectCategory,
  onProductClick,
}) => {
  const [search, setSearch] = useState('');
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filteredProducts = products.filter((p) => (selectedCategory === 'all' || p.category === selectedCategory) && normalize(`${p.name} ${p.description}`).includes(normalize(search.trim())));

  return (
    <div className="catalog-container">
      <div className="catalog-header">
        <div className="catalog-heading"><div><h2 className="catalog-title">MENÚ</h2><p>Tu pausa empieza aquí.</p></div><label className="catalog-search"><UiIcon name="search" /><span className="sr-only">Buscar en el menú</span><input type="search" placeholder="Buscar tu favorito" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
        <div className="categories-tabs">
          {(['all', 'coffee', 'cold', 'bakery'] as const).map((cat) => (
            <button
              key={cat}
              aria-pressed={selectedCategory === cat}
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

      <div className="products-grid" aria-busy={loading}>
        {loading && <p className="catalog-empty" role="status">Preparando el menú…</p>}
        {!loading && filteredProducts.length === 0 && <div className="catalog-empty"><UiIcon name="coffee" size={40} /><h3>{products.length ? 'No encontramos ese antojo' : 'El menú aún no está disponible'}</h3><p>{products.length ? 'Prueba otro nombre o cambia de categoría.' : 'Revisa la conexión para cargar los productos.'}</p><button className="btn btn-secondary" onClick={products.length ? () => { setSearch(''); onSelectCategory('all'); } : onRetry}>{products.length ? 'Ver todo el menú' : 'Volver a cargar'}</button></div>}
        {filteredProducts.map((product) => {
          const isDepleted = product.stock !== undefined && product.stock <= 0;
          return (
            <button
              type="button"
              key={product.id}
              className={`product-card ${isDepleted ? 'product-card-depleted' : ''}`}
              disabled={isDepleted}
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
            </button>
          );
        })}
      </div>
    </div>
  );
};
