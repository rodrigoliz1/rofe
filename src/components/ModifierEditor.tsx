import type { CustomVariantGroup, CustomVariantOption } from '../types';
interface Ingredient { id: string; name: string; unit: string; stock: number; cost: number }
interface Props { groups: CustomVariantGroup[]; onChange: (groups: CustomVariantGroup[]) => void; inventory: Ingredient[]; recipe: Record<string, number> }
export function ModifierEditor({ groups, onChange, inventory, recipe }: Props) {
  const update = (index: number, patch: Partial<CustomVariantGroup>) => onChange(groups.map((g, i) => i === index ? { ...g, ...patch } : g));
  const option = (g: number, o: number, patch: Partial<CustomVariantOption>) => update(g, { options: groups[g].options.map((item, i) => i === o ? { ...item, ...patch } : item) });
  const add = (purpose: CustomVariantGroup['purpose']) => onChange([...groups, {
    title: purpose === 'sugar' ? 'Azúcar' : purpose === 'splenda' ? 'Splenda' : 'Nueva personalización', purpose, enabled: false,
    kind: purpose === 'splenda' ? 'quantity' : 'choice', amountPerUnit: purpose === 'splenda' ? 1 : undefined,
    options: purpose === 'sugar' ? ['Poco', 'Normal', 'Mucho'].map(name => ({ name, priceModifier: 0 })) : [],
  }]);
  const amount = (v: string) => v === '' ? undefined : Number(v);
  const choices = (selected: string | undefined, change: (id: string) => void, label: string) => <label>{label}<select value={selected ?? ''} onChange={event => change(event.target.value)}><option value="">Selecciona un insumo…</option>{inventory.map(item => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>;
  const cost = Object.entries(recipe).reduce((sum, [id, quantity]) => { const item = inventory.find(i => i.id === id); return sum + (item && item.stock > 0 ? quantity * item.cost / item.stock : 0); }, 0);
  return <section className="modifier-editor">
    <h3>Personalizaciones y receta</h3><p>Receta base: costo estimado ${cost.toFixed(2)}. Configura cantidades en la unidad del inventario, revisa el precio y después habilita cada grupo. Las opciones deshabilitadas son borradores y no aparecen al cliente.</p>
    <div className="modifier-editor-actions"><button type="button" onClick={() => add('splenda')}>Añadir Splenda por sobres</button><button type="button" onClick={() => add('sugar')}>Añadir niveles de azúcar</button><button type="button" onClick={() => add('general')}>Añadir otra personalización</button></div>
    {groups.map((group, index) => <fieldset key={index} className="modifier-fieldset"><legend>{group.title}</legend>{group.purpose === 'sugar' && inventory.find(i => i.id === group.ingredientId)?.unit !== 'g' && <p className="inline-feedback error">Pendiente: regulariza el insumo de azúcar en gramos antes de habilitar estos niveles. No conviertas existencias sin una equivalencia verificada.</p>}
      <div className="modifier-editor-grid"><label>Nombre del grupo<input value={group.title} onChange={e => update(index, { title: e.target.value })} /></label>
        <label>Tipo<select value={group.purpose ?? 'general'} onChange={e => update(index, { purpose: e.target.value as CustomVariantGroup['purpose'] })}>{[['general','Otra'],['size','Tamaño'],['milk','Leche'],['ice','Hielo'],['temperature','Temperatura'],['coffee','Intensidad / shots'],['sugar','Azúcar'],['splenda','Splenda']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Selección<select value={group.kind ?? 'choice'} onChange={e => update(index, { kind: e.target.value as 'choice' | 'quantity' })}><option value="choice">Elegir una opción</option><option value="quantity">Contar unidades</option></select></label>
        {choices(group.ingredientId, ingredientId => update(index, { ingredientId: ingredientId || undefined }), group.purpose === 'milk' ? 'Leche de la receta base' : 'Insumo (si consume unidades)')}
      </div>
      <div className="modifier-editor-actions"><label><input type="checkbox" checked={group.enabled !== false} onChange={e => update(index, { enabled: e.target.checked })} /> Habilitado y revisado</label><label><input type="checkbox" checked={Boolean(group.required)} onChange={e => update(index, { required: e.target.checked })} /> Selección obligatoria</label><button type="button" onClick={() => onChange(groups.filter((_, i) => i !== index))}>Quitar grupo</button></div>
      {group.kind === 'quantity' ? <div className="modifier-editor-grid">
        <label>Mínimo de unidades<input type="number" min="0" max="50" step="1" value={group.min ?? ''} onChange={e => update(index, { min: amount(e.target.value) })} required={group.enabled !== false} /></label>
        <label>Máximo de unidades<input type="number" min="0" max="50" step="1" value={group.max ?? ''} onChange={e => update(index, { max: amount(e.target.value) })} required={group.enabled !== false} /></label>
        <label>Cantidad de insumo por unidad ({inventory.find(i => i.id === group.ingredientId)?.unit ?? 'sin unidad'})<input type="number" min="0" step="any" readOnly={group.purpose === 'splenda'} value={group.amountPerUnit ?? ''} onChange={e => update(index, { amountPerUnit: amount(e.target.value) })} /></label>
        <label>Recargo por unidad (MXN)<input type="number" min="0" step="0.01" value={group.pricePerUnit ?? ''} onChange={e => update(index, { pricePerUnit: amount(e.target.value) })} /></label>
      </div> : <>
        {group.options.map((item, oi) => <div key={oi} className="modifier-option-editor"><div className="modifier-editor-grid">
          <label>Opción<input value={item.name} onChange={e => option(index, oi, { name: e.target.value })} /></label><label>Recargo (MXN)<input type="number" min="0" step="0.01" value={item.priceModifier} onChange={e => option(index, oi, { priceModifier: Number(e.target.value) })} /></label>
          {group.purpose === 'milk' ? choices(item.ingredientId, id => option(index, oi, { ingredientId: id || undefined }), 'Sustituir por (misma cantidad y unidad)') : group.ingredientId && <label>Cantidad añadida ({group.purpose === 'sugar' ? 'g' : inventory.find(i => i.id === group.ingredientId)?.unit ?? ''})<input type="number" min="0" step="any" value={item.ingredientQuantity ?? ''} onChange={e => option(index, oi, { ingredientQuantity: amount(e.target.value) })} /></label>}
          <label>Instrucción para barra<input value={item.instruction ?? ''} maxLength={160} onChange={e => option(index, oi, { instruction: e.target.value })} /></label>
        </div>
        {!['milk', 'sugar'].includes(group.purpose ?? '') && <div className="modifier-recipe-changes"><p>Variaciones respecto a la receta base. Un valor negativo retira esa cantidad.</p>{Object.entries(item.recipeDeltas ?? {}).map(([id, qty]) => <label key={id}>{inventory.find(i => i.id === id)?.name ?? id} ({inventory.find(i => i.id === id)?.unit})<input type="number" step="any" value={qty} onChange={e => option(index, oi, { recipeDeltas: { ...item.recipeDeltas, [id]: Number(e.target.value) } })} /><button type="button" onClick={() => { const next = { ...item.recipeDeltas }; delete next[id]; option(index, oi, { recipeDeltas: next }); }}>Quitar insumo</button></label>)}{choices('', id => { if (id) option(index, oi, { recipeDeltas: { ...item.recipeDeltas, [id]: 0 } }); }, 'Añadir variación de insumo')}</div>}
        <button type="button" onClick={() => update(index, { options: group.options.filter((_, i) => i !== oi) })}>Quitar opción</button></div>)}
        <button type="button" onClick={() => update(index, { options: [...group.options, { name: 'Nueva opción', priceModifier: 0 }] })}>Añadir opción</button>
      </>}
    </fieldset>)}
  </section>;
}
