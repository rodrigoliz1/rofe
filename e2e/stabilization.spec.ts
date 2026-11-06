import { expect, test } from '@playwright/test';
const API='http://127.0.0.1:3100';
test('administration exposes pending Point exceptions without offering a second charge',async({page,request})=>{
  await page.setViewportSize({width:1280,height:800});
  const device=await(await request.post(`${API}/api/auth/device/register`,{data:{name:'Stabilization test',enrollmentSecret:'e2e-device-enrollment-secret'}})).json();
  const login=await(await request.post(`${API}/api/auth/device/login`,{data:device})).json();
  const created=await request.post(`${API}/api/orders`,{headers:{Authorization:`Bearer ${login.accessToken}`},data:{operationId:crypto.randomUUID(),customerName:'Private isolated fixture',paymentMethod:'card',items:[{productId:'espresso',quantity:1}]}});
  expect(created.status()).toBe(201);const order=(await created.json()).order;
  await page.goto('/');await page.getByLabel('Nombre de la terminal').fill('M10 audit');await page.getByLabel('Clave de registro').fill('e2e-device-enrollment-secret');await page.getByRole('button',{name:'Autorizar terminal'}).click();
  await page.getByTitle('Panel Barista').click();await page.getByLabel('Correo').fill('admin@rofe.test');await page.getByLabel('Contraseña o PIN').fill('TestAdmin123!');await page.getByRole('button',{name:'Ingresar'}).click();
  await page.getByRole('button',{name:'Terminal Point',exact:true}).click();
  const panel=page.getByRole('region',{name:'Conciliación de pagos Point'});
  await expect(panel).toContainText(order.folio);await expect(panel).toContainText('Referencia pendiente de recuperación');await expect(panel).toContainText('Conciliación programada deshabilitada.');
  await expect(panel).not.toContainText('Private isolated fixture');await expect(panel.getByRole('button',{name:/cobrar|reenviar/i})).toHaveCount(0);
  await panel.screenshot({path:'docs/evidence/barista-stabilization-point.png'});
});
