import { useEffect, useMemo, useState } from 'react';
import type { Product, CustomizationOptions, CartItem, CustomVariantGroup } from '../types';
import { configuredItemId } from '../utils/cart';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useBackHandler } from '../kiosk/backStack';
import { productPhoto } from '../services/productImages';
import { apiFetch, publicError } from '../services/api';
interface Props { product: Product; onClose: () => void; onAddToCart: (item: CartItem) => void; showPhoto?: boolean }
interface Quote { total: number; items: Array<{ unitPrice: number; preparation: string[] }> }
export function ProductModal({ product, onClose, onAddToCart, showPhoto = true }: Props) {
  const dialogRef = useDialogFocus(onClose);
  useBackHandler(true, () => { onClose(); return true; });
  const photo = showPhoto ? productPhoto(product).detail : null;
  const groups = (product.custom_variants ?? []).filter(group => group.enabled !== false);
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(groups.filter(g => g.kind === 'quantity').map(g => [g.title, g.min ?? 0])));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const customization = useMemo<CustomizationOptions>(() => ({ size: 'regular', milk: 'none', sweetness: 'none', temp: product.category === 'cold' ? 'iced' : 'hot', extraShot: false }), [product.category]);
  const payload = useMemo(() => ({ productId: product.id, quantity, customization, selectedCustomVariants: selections, quantitySelections: counts }), [product.id, quantity, customization, selections, counts]);
  const preview = (product.price + groups.reduce((sum, g) => sum + (g.kind === 'quantity' ? (counts[g.title] ?? 0) * (g.pricePerUnit ?? 0) : g.options.find(o => o.name === selections[g.title])?.priceModifier ?? 0), 0)) * quantity;
  useEffect(() => {
    const controller = new AbortController();
    setQuoting(true); setQuote(null); setError(''); setOffline(false);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await apiFetch(window.location.pathname.startsWith('/pedir') ? '/api/pickup/quote' : '/api/orders/quote', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [payload] }) });
          if (!response.ok) { const message = await publicError(response); if (!controller.signal.aborted) setError(message); return; }
          const result = await response.json() as Quote;
          if (!controller.signal.aborted) setQuote(result);
        } catch { if (!controller.signal.aborted) { setOffline(true); setError('Sin conexión. El precio y los ingredientes se verificarán al sincronizar.'); } }
        finally { if (!controller.signal.aborted) setQuoting(false); }
      })();
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [payload]);
  const choose = (group: CustomVariantGroup, name: string) => {
    setSelections(current => { const next = { ...current }; if (next[group.title] === name && !group.required) delete next[group.title]; else next[group.title] = name; return next; });
    if (group.purpose === 'sugar') setCounts(current => Object.fromEntries(Object.entries(current).map(([title, value]) => [title, groups.find(g => g.title === title)?.purpose === 'splenda' ? 0 : value])));
  };
  const count = (group: CustomVariantGroup, value: number) => {
    setCounts(current => ({ ...current, [group.title]: value }));
    if (value > 0 && group.purpose === 'splenda') setSelections(current => Object.fromEntries(Object.entries(current).filter(([title]) => groups.find(g => g.title === title)?.purpose !== 'sugar')));
  };
  const add = () => {
    if (quoting || (!quote && !offline)) return;
    const preparation = quote?.items[0].preparation ?? groups.flatMap(g => g.kind === 'quantity' ? counts[g.title] ? [`${g.title}: ${counts[g.title]} unidades`] : [] : selections[g.title] ? [`${g.title}: ${selections[g.title]}`] : []);
    onAddToCart({ id: configuredItemId(product.id, customization, selections, counts), product, quantity, customization, selectedCustomVariants: selections, quantitySelections: counts, preparation, totalPrice: quote?.total ?? preview }); onClose();
  };
  return <div className="modal-backdrop" onClick={onClose}><div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Personalizar ${product.name}`} className="modal-sheet" onClick={e => e.stopPropagation()}>
    <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar personalización">×</button><header className="modal-header"><div><h2 className="modal-title">{product.name}</h2><p className="modal-desc">{product.description}</p></div></header>
    <div className="modal-body">{photo && <div className="modal-photo"><img src={photo} alt={product.name} width={960} height={960} decoding="async" draggable={false} /></div>}
      {!groups.length && <p className="customization-base-note">Preparado con la receta de la casa. Las opciones adicionales se habilitan desde Administración.</p>}
      {groups.map(group => <section className="customization-section" key={group.title}><h3 className="section-label">{group.title}{group.required ? ' · elige una opción' : ''}</h3>
        {group.kind === 'quantity' ? <div className="modifier-count"><span>{group.purpose === 'splenda' ? 'Sobres individuales' : 'Unidades'} · máximo {Math.min(group.max ?? 0, group.availableMax ?? group.max ?? 0)} disponibles{group.pricePerUnit ? ` · $${group.pricePerUnit.toFixed(2)} por unidad` : ''}</span><div className="quantity-selector"><button type="button" className="qty-btn" aria-label={`Quitar ${group.title}`} disabled={(counts[group.title] ?? 0) <= (group.min ?? 0)} onClick={() => count(group, (counts[group.title] ?? 0) - 1)}>−</button><output aria-label={`Cantidad de ${group.title}`}>{counts[group.title] ?? 0}</output><button type="button" className="qty-btn" aria-label={`Añadir ${group.title}`} disabled={(counts[group.title] ?? 0) >= Math.min(group.max ?? 0, group.availableMax ?? group.max ?? 0)} onClick={() => count(group, (counts[group.title] ?? 0) + 1)}>+</button></div></div> : <div className="options-selector">{group.options.map(option => <button type="button" key={option.name} disabled={option.available === false} aria-pressed={selections[group.title] === option.name} className={`option-btn ${selections[group.title] === option.name ? 'active' : ''}`} onClick={() => choose(group, option.name)}>{option.name}{option.ingredientQuantity && <span className="option-sub">{option.ingredientQuantity} {group.purpose === 'sugar' ? 'g' : 'unidades'}</span>}{option.priceModifier > 0 && <span className="option-sub">+${option.priceModifier.toFixed(2)}</span>}{option.available === false && <span className="option-sub">Agotado</span>}</button>)}</div>}
      </section>)}
      {error && <p className={`inline-feedback ${offline ? '' : 'error'}`} role="status">{error}</p>}
    </div><footer className="modal-footer"><div className="quantity-selector"><button className="qty-btn" disabled={quantity <= 1} aria-label="Quitar un producto" onClick={() => setQuantity(q => q - 1)}>−</button><span className="qty-value">{quantity}</span><button className="qty-btn" disabled={quantity >= 50} aria-label="Añadir un producto" onClick={() => setQuantity(q => q + 1)}>+</button></div><button className="add-to-cart-btn" disabled={quoting || (!quote && !offline)} onClick={add}><span>{quoting ? 'Verificando…' : 'Agregar a la Orden'}</span><span className="price-tag">${(quote?.total ?? preview).toFixed(2)} MXN</span></button></footer>
  </div></div>;
}
