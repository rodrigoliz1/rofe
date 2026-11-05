import React, { useState } from 'react';
import type { Product } from '../types';
import { ProductIcon } from './Icons';
import { productPhoto } from '../services/productImages';
import { isImageReady } from '../services/imagePreload';
import { UiIcon } from './UiIcon';

interface ProductCardImageProps {
  product: Product;
  priority?: boolean;
}

/**
 * Card photo with a stable square box: the skeleton occupies the exact final size, so
 * nothing jumps when the photo arrives. Photos already preloaded on the welcome screen
 * render immediately; the rest fade in quickly. Pending/missing photos show the brand
 * illustration instead of a wrong picture.
 */
const ProductCardImage: React.FC<ProductCardImageProps> = ({ product, priority = false }) => {
  const photo = productPhoto(product);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(() => isImageReady(photo.card) ? photo.card : null);
  const src = photo.card;

  if (!src || failedUrl === src) {
    return (
      <div className="product-card-icon-wrapper" data-photo={photo.source}>
        <ProductIcon name={product.icon} className="product-card-icon" size={40} />
      </div>
    );
  }

  const loaded = loadedUrl === src || isImageReady(src);
  return (
    <div className={`product-card-image-wrapper${loaded ? ' is-loaded' : ''}`} data-photo={photo.source}>
      <img
        src={src}
        alt=""
        className="product-card-image"
        width={640}
        height={640}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        draggable={false}
        onLoad={() => setLoadedUrl(src)}
        onError={() => setFailedUrl(src)}
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
  /** The self-service kiosk hides free-text search to avoid the keyboard. */
  showSearch?: boolean;
  /** Images of the first N visible products load eagerly; the rest stay lazy. */
  priorityImages?: number;
}

export const Catalog: React.FC<CatalogProps> = ({
  products, loading, onRetry,
  selectedCategory,
  onSelectCategory,
  onProductClick,
  showSearch = true,
  priorityImages = 0,
}) => {
  const [search, setSearch] = useState('');
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filteredProducts = products.filter((p) => (selectedCategory === 'all' || p.category === selectedCategory) && normalize(`${p.name} ${p.description}`).includes(normalize(search.trim())));

  return (
    <div className="catalog-container">
      <div className="catalog-header">
        <div className="catalog-heading"><div><h2 className="catalog-title">MENÚ</h2><p>Tu pausa empieza aquí.</p></div>{showSearch && <label className="catalog-search"><UiIcon name="search" /><span className="sr-only">Buscar en el menú</span><input type="search" placeholder="Buscar tu favorito" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}</div>
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
        {filteredProducts.map((product, index) => {
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
              <ProductCardImage product={product} priority={index < priorityImages} />
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
