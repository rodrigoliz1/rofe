import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const API = 'http://127.0.0.1:3100';
test('administrative recipe → customized kiosk order → cash → preparation consumes exact ingredients once', async ({ page, request, browser }) => {
  test.setTimeout(60_000);
  const login = async (email: string, password: string) => ({ Authorization: `Bearer ${(await (await request.post(`${API}/api/auth/login`, { data: { email, password } })).json()).accessToken}` });
  const admin = await login('admin@rofe.test', 'TestAdmin123!');
  const staff = await login('barista@rofe.test', '12345678');
  for (const ingredient of [{ id: 'test_sugar', name: 'Azúcar de prueba', unit: 'g' }, { id: 'test_splenda', name: 'Splenda de prueba', unit: 'piece' }]) {
    expect((await request.post(`${API}/api/admin/raw-inventory/add-item`, { headers: admin, data: ingredient })).status()).toBe(200);
  }
  expect((await request.post(`${API}/api/admin/purchases`, { headers: admin, data: { operationId: randomUUID(), paymentMethod: 'transfer', items: [{ ingredientId: 'test_sugar', quantity: 100, unitCost: 0.1 }, { ingredientId: 'test_splenda', quantity: 20, unitCost: 2 }] } })).status()).toBe(201);
  // These quantities are explicit administrative fixtures; they never modify business data.
  const product = { id: 'test-custom-drink', name: 'Bebida de prueba', description: 'Receta de aceptación automatizada', price: 50, category: 'coffee', icon: 'latte', image: '', customizable: true, recipe: { coffee_beans: 10, milk_whole: 100 }, custom_variants: [
    { title: 'Azúcar', purpose: 'sugar', ingredientId: 'test_sugar', enabled: true, options: [2, 4, 6].map((ingredientQuantity, i) => ({ name: ['Poco', 'Normal', 'Mucho'][i], ingredientQuantity, priceModifier: 0 })) },
    { title: 'Splenda', purpose: 'splenda', kind: 'quantity', ingredientId: 'test_splenda', amountPerUnit: 1, min: 0, max: 3, pricePerUnit: 1, enabled: true, options: [] },
  ] };
  expect((await request.post(`${API}/api/products`, { headers: admin, data: product })).status()).toBe(201);
  const before = await (await request.get(`${API}/api/admin/raw-inventory`, { headers: admin })).json() as Array<{ id: string; stock: number }>;
  const stock = (rows: typeof before, id: string) => rows.find(i => i.id === id)!.stock;
  try {
    const current = await (await request.get(`${API}/api/admin/cash/session`, { headers: admin })).json();
    if (current.current) await request.post(`${API}/api/admin/cash/session/close`, { headers: admin, data: { sessionId: (await (await request.get('http://127.0.0.1:3100/api/admin/cash/session', { headers: admin })).json()).current.id, denominations: await (await request.get(`${API}/api/admin/cash`, { headers: admin })).json() } });
    expect((await request.post(`${API}/api/admin/cash/session/open`, { headers: admin, data: { operationId: randomUUID(), denominations: { bill_20: 10, coin_5: 10, coin_2: 10, coin_1: 10 } } })).status()).toBe(201);
    await page.goto('/kiosk'); await page.getByLabel('Nombre de la terminal').fill('Kiosco recetas'); await page.getByLabel('Clave de registro').fill('e2e-device-enrollment-secret'); await page.getByRole('button', { name: 'Autorizar terminal', exact: true }).click(); await page.getByText('ORDENAR AQUÍ', { exact: true }).click();
    await page.getByRole('button', { name: /^Bebida de prueba/ }).click();
    await page.getByRole('button', { name: 'Añadir Splenda', exact: true }).click(); await page.getByRole('button', { name: 'Añadir Splenda', exact: true }).click();
    await expect(page.getByLabel('Cantidad de Splenda')).toHaveText('2');
    await expect(page.getByRole('button', { name: /Agregar a la Orden/ })).toContainText('$52.00');
    await page.screenshot({ path: 'docs/evidence/personalization-customer.png' });
    await page.getByRole('button', { name: /Agregar a la Orden/ }).click(); await page.getByRole('button', { name: /^Tu pedido,/i }).click(); await page.getByRole('button', { name: /CONTINUAR AL PAGO/ }).click(); await page.getByPlaceholder('Ingresa tu nombre...').fill('Prueba receta'); await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
    const created = page.waitForResponse(r => r.url() === `${API}/api/orders` && r.request().method() === 'POST'); await page.getByRole('button', { name: /PAGO EN EFECTIVO/ }).click(); const order = (await (await created).json()).order;
    expect(order.total).toBe(52); expect(order.items[0].recipeSnapshot.test_splenda).toBe(2); expect(order.items[0].recipeCostSnapshot).toBeGreaterThan(0); expect(order.items[0].preparation).toContain('Splenda: 2 sobres');
    const barContext = await browser.newContext(); const bar = await barContext.newPage(); await bar.goto('/barista'); await bar.getByLabel('Correo').fill('barista@rofe.test'); await bar.getByLabel('Contraseña', { exact: true }).fill('12345678'); await bar.getByRole('button', { name: 'Iniciar turno', exact: true }).click(); await expect(bar.getByText('Splenda: 2 sobres', { exact: true }).first()).toBeVisible(); await bar.screenshot({ path: 'docs/evidence/personalization-barista.png' });
    const payment = { receivedDenominations: { bill_100: 1 }, changeDenominations: { bill_20: 2, coin_5: 1, coin_2: 1, coin_1: 1 }, receivedAmount: 100, changeAmount: 48 };
    for (let i = 0; i < 2; i++) expect((await request.post(`${API}/api/orders/${order.id}/cash-payment`, { headers: staff, data: payment })).status()).toBe(200);
    for (const status of ['IN_PREPARATION', 'READY', 'COMPLETED']) expect((await request.post(`${API}/api/orders/${order.id}/status`, { headers: staff, data: { status } })).status()).toBe(200);
    const after = await (await request.get(`${API}/api/admin/raw-inventory`, { headers: admin })).json() as typeof before;
    expect(stock(after, 'test_splenda')).toBe(stock(before, 'test_splenda') - 2); expect(stock(after, 'test_sugar')).toBe(stock(before, 'test_sugar')); expect(stock(after, 'coffee_beans')).toBe(stock(before, 'coffee_beans') - 10); expect(stock(after, 'milk_whole')).toBe(stock(before, 'milk_whole') - 100);
    const movements = await (await request.get(`${API}/api/admin/inventory-movements`, { headers: admin })).json() as Array<{ orderId: string; ingredientId: string }>;
    expect(movements.filter(m => m.orderId === order.id && m.ingredientId === 'test_splenda')).toHaveLength(1);
    const sugar = await request.post(`${API}/api/pickup/quote`, { data: { items: [{ productId: product.id, quantity: 1, selectedCustomVariants: { 'Azúcar': 'Normal' } }] } }); expect(sugar.status()).toBe(200); expect((await sugar.json()).items[0].preparation).toContain('Azúcar: Normal (4 g)');
    const invalid = await request.post(`${API}/api/pickup/quote`, { data: { items: [{ productId: product.id, quantity: 1, quantitySelections: { Splenda: 4 } }] } }); expect(invalid.status()).toBe(400);
    await barContext.close();
  } finally { await request.delete(`${API}/api/products/${product.id}`, { headers: admin }); }
});
