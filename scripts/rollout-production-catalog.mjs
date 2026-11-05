// Only custom_variants may be written. No stock, recipes, prices, orders or SQL migrations.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { prepareCatalogModifiers } = require('../backend/dist/domain/catalogRollout.js');
const { priceOrder } = require('../backend/dist/domain/pricing.js');
const root = resolve(import.meta.dirname, '..');
const env = parseEnv(await readFile(resolve(root, 'backend/.env'), 'utf8'));
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('Faltan credenciales de Supabase en el perfil protegido.');
const base = new URL('/rest/v1/', env.SUPABASE_URL);
const headers = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
async function request(path, method = 'GET', data) {
  if (method !== 'GET' && (method !== 'PATCH' || !path.startsWith('products?') || Object.keys(data ?? {}).join() !== 'custom_variants')) throw new Error('Escritura fuera del alcance permitido.');
  const response = await fetch(new URL(path, base), { method, headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: HTTP ${response.status}`);
  return response.json();
}
const directory = resolve(root, '.rofe-local/production-readonly');
await mkdir(directory, { recursive: true, mode: 0o700 });
const planFile = resolve(directory, 'catalog-rollout-plan.json');
const apply = process.argv.includes('--apply');
const [schema, products, raw] = await Promise.all([request('rpc/rofe_schema_version'), request('products?select=*'), request('raw_inventory?select=*')]);
if (schema !== 8) throw new Error('Revisar compatibilidad: se esperaba el esquema 008, sin aplicar migraciones.');
const inventory = raw.map(item => ({ ...item, averageUnitCost: item.average_unit_cost, reservedStock: item.reserved_stock }));
const plan = apply ? JSON.parse(await readFile(planFile, 'utf8')) : { createdAt: new Date().toISOString(), products, inventory: raw, ...prepareCatalogModifiers(products, inventory) };
for (const product of products) {
  const patch = plan.patches.find(item => item.id === product.id);
  const candidate = patch ? { ...product, custom_variants: patch.after } : product;
  // Read-only quotes prove compatibility; never create an order or reserve stock.
  priceOrder([candidate], [{ productId: product.id, quantity: 1 }], inventory);
  if (candidate.custom_variants?.some(group => group.purpose === 'splenda' && group.enabled)) {
    const quote = priceOrder([candidate], [{ productId: product.id, quantity: 1, quantitySelections: { [candidate.custom_variants.find(group => group.purpose === 'splenda').title]: 2 } }], inventory);
    if (quote.items[0].recipeSnapshot.splenda !== 2) throw new Error('Los sobres no coinciden con la receta.');
  }
}
if (!apply) {
  await writeFile(planFile, JSON.stringify(plan, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ mode: 'preview', schema, products: products.length, patches: plan.patches.map(item => item.id), review: plan.review, backup: planFile }, null, 2));
} else {
  // Verify every record before the first patch; preserve concurrent administrative edits.
  for (const patch of plan.patches) {
    const original = plan.products.find(item => item.id === patch.id);
    const current = products.find(item => item.id === patch.id);
    if (!current || !original) throw new Error('Cambió el catálogo; vuelve a generar el plan.');
    const { custom_variants: oldGroups, ...oldBase } = original;
    const { custom_variants: currentGroups, ...currentBase } = current;
    if (JSON.stringify(oldBase) !== JSON.stringify(currentBase) || ![JSON.stringify(oldGroups), JSON.stringify(patch.after)].includes(JSON.stringify(currentGroups))) throw new Error('Cambió un producto desde el respaldo; no se sobrescribió.');
  }
  const applied = [];
  for (const patch of plan.patches) {
    const current = products.find(item => item.id === patch.id);
    if (JSON.stringify(current.custom_variants) === JSON.stringify(patch.after)) continue;
    const query = new URLSearchParams({ id: `eq.${patch.id}`, select: 'id' });
    query.set('custom_variants', current.custom_variants === null ? 'is.null' : `eq.${JSON.stringify(current.custom_variants)}`);
    query.set('recipe', `eq.${JSON.stringify(current.recipe)}`);
    query.set('price', `eq.${current.price}`);
    query.set('customizable', `eq.${current.customizable}`);
    const rows = await request(`products?${query}`, 'PATCH', { custom_variants: patch.after });
    if (rows.length !== 1) throw new Error('Edición concurrente detectada: se detuvo la aplicación del plan.');
    applied.push(patch.id);
  }
  await writeFile(resolve(directory, 'catalog-rollout-result.json'), JSON.stringify({ applied, completedAt: new Date().toISOString(), writeScope: 'products.custom_variants only' }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ mode: 'applied', applied, writeScope: 'products.custom_variants only' }));
}
