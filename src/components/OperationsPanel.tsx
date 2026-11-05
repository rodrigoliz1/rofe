import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { DenominationInput } from './DenominationInput';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { apiFetch, publicError } from '../services/api';
import { createOperationId } from '../utils/id';

interface Ingredient { id: string; name: string; unit: string; stock: number; cost: number }
interface Supplier { id: string; name: string; contactName?: string; phone?: string; email?: string }
interface Purchase { id: string; total: number; paymentMethod: string; purchasedAt: string; invoiceReference?: string; items: Array<{ ingredientId: string; quantity: number; unit: string }> }
interface Waste { id: string; ingredientId: string; quantity: number; costSnapshot: number; reason: string; createdAt: string }

export function OperationsPanel({ onInventoryUpdate }: { onInventoryUpdate: () => void }) {
  const actions = useAsyncAction();
  const [cashDenominations, setCashDenominations] = useState<Record<string, number>>({});
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [waste, setWaste] = useState<Waste[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [purchaseIngredient, setPurchaseIngredient] = useState('');
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [purchaseTotal, setPurchaseTotal] = useState('');
  const [purchaseMethod, setPurchaseMethod] = useState<'cash' | 'card' | 'transfer' | 'credit'>('transfer');
  const [purchaseReference, setPurchaseReference] = useState('');
  const [purchaseOperationId, setPurchaseOperationId] = useState(() => createOperationId());
  const [wasteIngredient, setWasteIngredient] = useState('');
  const [wasteQuantity, setWasteQuantity] = useState('');
  const [wasteReason, setWasteReason] = useState('');
  const [wasteOperationId, setWasteOperationId] = useState(() => createOperationId());

  const ingredientNames = useMemo(() => new Map(ingredients.map((item) => [item.id, item.name])), [ingredients]);

  const load = useCallback(async () => {
    const responses = await Promise.all([
      apiFetch('/api/admin/raw-inventory'), apiFetch('/api/admin/suppliers'),
      apiFetch('/api/admin/purchases'), apiFetch('/api/admin/waste'),
    ]);
    const failed = responses.find((response) => !response.ok);
    if (failed) throw new Error(await publicError(failed));
    const [ingredientData, supplierData, purchaseData, wasteData] = await Promise.all(responses.map((response) => response.json()));
    setIngredients(ingredientData as Ingredient[]);
    setSuppliers(supplierData as Supplier[]);
    setPurchases(purchaseData as Purchase[]);
    setWaste(wasteData as Waste[]);
  }, []);

  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No pudimos cargar operaciones.')); }, [load]);

  const submit = async (path: string, payload: unknown, success: string) => {
    setError(''); setMessage('');
    const response = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(await publicError(response));
    setMessage(success);
    await load();
    onInventoryUpdate();
  };

  const addSupplier = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await submit('/api/admin/suppliers', { name: supplierName, contactName: supplierContact || undefined }, 'Proveedor registrado.');
      setSupplierName(''); setSupplierContact('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos registrar el proveedor.'); }
  };

  const addPurchase = async (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(purchaseQuantity); const total = Number(purchaseTotal);
    if (quantity <= 0 || total < 0) return setError('Captura cantidad y costo válidos.');
    try {
      await submit('/api/admin/purchases', {
        operationId: purchaseOperationId, supplierId: purchaseSupplier || undefined,
        invoiceReference: purchaseReference || undefined, paymentMethod: purchaseMethod, cashDenominations: purchaseMethod === 'cash' ? cashDenominations : undefined,
        items: [{ ingredientId: purchaseIngredient, quantity, unitCost: total / quantity }],
      }, 'Compra e inventario registrados.');
      setPurchaseQuantity(''); setPurchaseTotal(''); setPurchaseReference(''); setPurchaseOperationId(createOperationId()); setCashDenominations({});
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos registrar la compra.'); }
  };

  const addWaste = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await submit('/api/admin/waste', { operationId: wasteOperationId, ingredientId: wasteIngredient, quantity: Number(wasteQuantity), reason: wasteReason }, 'Merma registrada y descontada.');
      setWasteQuantity(''); setWasteReason(''); setWasteOperationId(createOperationId());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos registrar la merma.'); }
  };

  return (
    <section className="operations-panel" aria-labelledby="operations-title">
      <header><h3 id="operations-title">OPERACIONES DE INVENTARIO</h3><p>Compras y mermas crean movimientos permanentes; el stock nunca se ajusta en silencio.</p></header>
      {(error || actions.error) && <div className="inline-feedback error" role="alert">{error || actions.error}</div>}
      {message && <div className="inline-feedback success" role="status">{message}</div>}
      <div className="operations-grid">
        <form className="operations-form" onSubmit={(event) => { event.preventDefault(); void actions.run(() => addPurchase(event)); }}>
          <h4>Registrar compra</h4>
          <label>Insumo<select required value={purchaseIngredient} onChange={(event) => setPurchaseIngredient(event.target.value)}><option value="">Selecciona…</option>{ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.stock} {item.unit}</option>)}</select></label>
          <div className="form-pair"><label>Cantidad<input required min="0.001" step="0.001" type="number" value={purchaseQuantity} onChange={(event) => setPurchaseQuantity(event.target.value)} /></label><label>Costo total<input required min="0" step="0.01" type="number" value={purchaseTotal} onChange={(event) => setPurchaseTotal(event.target.value)} /></label></div>
          <label>Proveedor<select value={purchaseSupplier} onChange={(event) => setPurchaseSupplier(event.target.value)}><option value="">Sin proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <div className="form-pair"><label>Pago<select value={purchaseMethod} onChange={(event) => setPurchaseMethod(event.target.value as typeof purchaseMethod)}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="credit">Crédito</option></select></label><label>Factura / folio<input value={purchaseReference} onChange={(event) => setPurchaseReference(event.target.value)} /></label></div>
          {purchaseMethod === 'cash' && <DenominationInput value={cashDenominations} onChange={setCashDenominations} label="Efectivo de la compra" />}
          <button type="submit" disabled={actions.busy}>Registrar compra</button>
        </form>
        <form className="operations-form" onSubmit={(event) => { event.preventDefault(); void actions.run(() => addWaste(event)); }}>
          <h4>Registrar merma</h4>
          <label>Insumo<select required value={wasteIngredient} onChange={(event) => setWasteIngredient(event.target.value)}><option value="">Selecciona…</option>{ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.stock} {item.unit}</option>)}</select></label>
          <label>Cantidad<input required min="0.001" step="0.001" type="number" value={wasteQuantity} onChange={(event) => setWasteQuantity(event.target.value)} /></label>
          <label>Razón<textarea required minLength={5} maxLength={240} value={wasteReason} onChange={(event) => setWasteReason(event.target.value)} placeholder="Caducidad, derrame, error de preparación…" /></label>
          <button type="submit" disabled={actions.busy}>Descontar y registrar</button>
        </form>
        <form className="operations-form compact" onSubmit={(event) => { event.preventDefault(); void actions.run(() => addSupplier(event)); }}>
          <h4>Nuevo proveedor</h4>
          <label>Nombre<input required minLength={2} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label>
          <label>Contacto<input value={supplierContact} onChange={(event) => setSupplierContact(event.target.value)} /></label>
          <button type="submit" disabled={actions.busy}>Guardar proveedor</button>
        </form>
      </div>
      <div className="operations-history">
        <section><h4>Compras recientes</h4>{purchases.length === 0 ? <p className="empty-note">Aún no hay compras.</p> : purchases.slice(0, 8).map((item) => <article key={item.id}><span>{new Date(item.purchasedAt).toLocaleDateString('es-MX')} · {item.invoiceReference || 'Sin folio'}</span><strong>${item.total.toFixed(2)}</strong></article>)}</section>
        <section><h4>Mermas recientes</h4>{waste.length === 0 ? <p className="empty-note">Aún no hay mermas.</p> : waste.slice(0, 8).map((item) => <article key={item.id}><span>{ingredientNames.get(item.ingredientId) || item.ingredientId} · {item.reason}</span><strong>-{item.quantity} · ${item.costSnapshot.toFixed(2)}</strong></article>)}</section>
      </div>
    </section>
  );
}
