import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { connect } from 'node:net';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, '.rofe-local/db.json');
const original = await readFile(path);
const data = JSON.parse(original);
if (!Array.isArray(data.products) || !Array.isArray(data.rawInventory)) throw new Error('El archivo local no contiene un catálogo válido.');
const ingredient = (id, name, unit) => {
  let item = data.rawInventory.find(i => i.id === id);
  if (!item) { item = { id, name, unit, stock: 0, cost: 0 }; data.rawInventory.push(item); }
  if (item.unit !== unit) throw new Error(`Revisa la unidad de ${name} antes de configurar cantidades.`);
  return item;
};
ingredient('sugar', 'Azúcar', 'g'); ingredient('splenda', 'Splenda (sobre individual)', 'piece');
const policy = {
  sugarGrams: { Poco: 2, Normal: 4, Mucho: 8 }, splendaMinimum: 0, splendaMaximum: 2, sweetenerSurcharge: 0,
  basis: 'Una cucharadita de azúcar equivale aproximadamente a 4 g; un sobre Splenda Original equivale en dulzor a dos cucharaditas. Niveles iniciales 1/2, 1 y 2 cucharaditas. El máximo de dos sobres es una política operativa inicial, editable; no una recomendación médica.',
  source: ['https://www.splenda.com/product/splenda-sweetener-packets/', 'https://www.sugar.org/resources/sugar-fun-facts/faqs/'],
};
let changed = 0;
for (const product of data.products) {
  if (!['coffee', 'cold'].includes(product.category) || product.customizable === false || !product.recipe) continue;
  const groups = (product.custom_variants ?? []).filter(g => !['sugar', 'splenda', 'milk', 'size', 'coffee', 'ice', 'temperature'].includes(g.purpose) && !/endulz|az[uú]car|splenda|leche|tama[ñn]o|shot|hielo|temperatura/i.test(g.title));
  groups.push({ title: 'Azúcar', purpose: 'sugar', enabled: true, ingredientId: 'sugar', options: Object.entries(policy.sugarGrams).map(([name, ingredientQuantity]) => ({ name, ingredientQuantity, priceModifier: 0 })) });
  groups.push({ title: 'Splenda', purpose: 'splenda', kind: 'quantity', enabled: true, ingredientId: 'splenda', amountPerUnit: 1, min: 0, max: policy.splendaMaximum, pricePerUnit: 0, options: [] });
  if (product.recipe.milk_whole) groups.push({ title: 'Leche', purpose: 'milk', enabled: true, ingredientId: 'milk_whole', options: [['milk_whole','Entera',0],['milk_light','Deslactosada',0],['milk_avena','Avena',15],['milk_almendra','Almendra',15]].filter(([id]) => data.rawInventory.some(i => i.id === id && i.unit === 'ml')).map(([ingredientId, name, priceModifier]) => ({ name, ingredientId, priceModifier })) });
  const shotDose = data.products.find(p => p.id === 'espresso')?.recipe?.coffee_beans;
  if (product.recipe.coffee_beans && shotDose > 0) groups.push({ title: 'Shots adicionales', purpose: 'coffee', kind: 'quantity', enabled: true, ingredientId: 'coffee_beans', amountPerUnit: shotDose, min: 0, max: 1, pricePerUnit: 15, options: [] });
  // Iced latte already defines the house ice portion. Reuse it for the cold-brew service.
  if (product.id === 'cold-brew' && !product.recipe.ice) {
    const ice = data.products.find(p => p.id === 'iced-latte')?.recipe?.ice;
    if (ice) product.recipe = { ...product.recipe, ice };
  }
  if (product.recipe.ice) groups.push({ title: 'Hielo', purpose: 'ice', enabled: true, options: [{ name: 'Normal', priceModifier: 0 }, { name: 'Poco', priceModifier: 0, recipeDeltas: { ice: -product.recipe.ice / 2 } }, { name: 'Sin hielo', priceModifier: 0, recipeDeltas: { ice: -product.recipe.ice } }] });
  // Only offer size when the recipe has a measured liquid. No 8/12 oz claim for espresso.
  if (Object.keys(product.recipe).some(id => ['ml','L'].includes(data.rawInventory.find(i => i.id === id)?.unit))) {
    const deltas = Object.fromEntries(Object.entries(product.recipe).filter(([id]) => ['g','kg','ml','L'].includes(data.rawInventory.find(i => i.id === id)?.unit)).map(([id, quantity]) => [id, quantity * 0.5]));
    groups.push({ title: 'Tamaño', purpose: 'size', enabled: true, options: [{ name: 'Regular', priceModifier: 0 }, { name: 'Grande', priceModifier: 12, recipeDeltas: deltas, instruction: 'Receta de la casa aumentada un 50 %.' }] });
  }
  if (product.category === 'coffee' && product.recipe.milk_whole) groups.push({ title: 'Temperatura', purpose: 'temperature', enabled: true, options: [{ name: 'Caliente', priceModifier: 0 }, { name: 'Tibio', priceModifier: 0, instruction: 'Servir tibio; evitar sobrecalentar la leche.' }] });
  product.custom_variants = groups; changed++;
}
console.log(JSON.stringify({ products: changed, policy, note: 'No se inventan existencias ni costos; los insumos nuevos permanecen en cero.' }, null, 2));
if (process.argv.includes('--apply')) {
  if (process.env.NODE_ENV === 'production') throw new Error('Este script sólo configura la base JSON aislada de desarrollo.');
  const running = await new Promise(accept => { const socket = connect({ host: '127.0.0.1', port: 3000 }); socket.once('connect', () => { socket.destroy(); accept(true); }); socket.once('error', () => accept(false)); });
  if (running) throw new Error('Detén ROFÉ local antes de aplicar para evitar escrituras concurrentes.');
  if (!original.equals(await readFile(path))) throw new Error('Los datos cambiaron durante la preparación. Vuelve a ejecutar el script.');
  const backup = resolve(root, '.rofe-local/backups/menu-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  await mkdir(dirname(backup), { recursive: true, mode: 0o700 }); await writeFile(backup, original, { flag: 'wx', mode: 0o600 });
  const temporary = path + '.menu.tmp'; await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 }); await rename(temporary, path);
  console.log(JSON.stringify({ applied: true, backup, previousHash: createHash('sha256').update(original).digest('hex') }));
}
