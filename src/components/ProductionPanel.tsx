import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Product } from '../types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { apiFetch, publicError } from '../services/api';
import { createOperationId } from '../utils/id';

interface ProductionBatch {
  id: string;
  productId: string;
  quantityProduced: number;
  wasteQuantity: number;
  totalCost: number;
  producedAt: string;
}

export function ProductionPanel({ products, onInventoryUpdate }: { products: Product[]; onInventoryUpdate: () => void }) {
  const actions = useAsyncAction();
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [waste, setWaste] = useState('0');
  const [expiresAt, setExpiresAt] = useState('');
  const [operationId, setOperationId] = useState(() => createOperationId());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await apiFetch('/api/admin/production');
    if (!response.ok) throw new Error(await publicError(response));
    setBatches(await response.json() as ProductionBatch[]);
  }, []);

  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No pudimos cargar producción.')); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    const quantityProduced = Number(quantity); const wasteQuantity = Number(waste);
    if (!Number.isInteger(quantityProduced) || quantityProduced <= 0 || !Number.isInteger(wasteQuantity) || wasteQuantity < 0 || wasteQuantity >= quantityProduced) {
      setError('Captura unidades enteras; la merma debe ser menor a lo producido.'); return;
    }
    const response = await apiFetch('/api/admin/production', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId, productId, quantityProduced, wasteQuantity, expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined }),
    });
    if (!response.ok) { setError(await publicError(response)); return; }
    setMessage('Lote registrado; materias primas y producto terminado fueron actualizados.');
    setQuantity(''); setWaste('0'); setExpiresAt(''); setOperationId(createOperationId());
    await load(); onInventoryUpdate();
  };

  return (
    <section className="operations-panel" aria-labelledby="production-title">
      <header><h3 id="production-title">PRODUCCIÓN POR LOTES</h3><p>Consume la receta, calcula el costo real y suma únicamente las unidades terminadas.</p></header>
      {(error || actions.error) && <div className="inline-feedback error" role="alert">{error || actions.error}</div>}
      {message && <div className="inline-feedback success" role="status">{message}</div>}
      <div className="operations-grid production-grid">
        <form className="operations-form" onSubmit={(event) => { event.preventDefault(); void actions.run(() => submit(event)); }}>
          <h4>Registrar lote</h4>
          <label>Producto<select required value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Selecciona…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <div className="form-pair"><label>Unidades producidas<input required type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>Merma del lote<input required type="number" min="0" step="1" value={waste} onChange={(event) => setWaste(event.target.value)} /></label></div>
          <label>Caducidad opcional<input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
          <button type="submit" disabled={actions.busy}>Confirmar producción</button>
        </form>
        <section className="operations-history production-history"><h4>Lotes recientes</h4>{batches.length === 0 ? <p className="empty-note">Aún no hay producción registrada.</p> : batches.slice(0, 12).map((batch) => <article key={batch.id}><span><strong>{products.find((product) => product.id === batch.productId)?.name || batch.productId}</strong><small>{new Date(batch.producedAt).toLocaleString('es-MX')} · neto {batch.quantityProduced - batch.wasteQuantity}</small></span><strong>${batch.totalCost.toFixed(2)}</strong></article>)}</section>
      </div>
    </section>
  );
}
