import { expect, test } from '@playwright/test';

for (const surface of ['pos', 'qr-desktop', 'qr-mobile'] as const) {
  test(`${surface}: product photo fits the modal and preparation controls remain reachable`, async ({ page }) => {
    await page.setViewportSize(surface === 'qr-mobile' ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    if (surface === 'pos') {
      await page.goto('/');
      await page.getByLabel('Nombre de la terminal').fill('POS foto acotada');
      await page.getByLabel('Clave de registro').fill('e2e-device-enrollment-secret');
      await page.getByRole('button', { name: 'Autorizar terminal' }).click();
      await page.getByText('ORDENAR AQUÍ').click();
      await page.getByRole('button', { name: /Latte.*55\.00/s }).click();
    } else {
      await page.goto('/pedir');
      await page.locator('.pickup-product').filter({ has: page.getByRole('heading', { name: 'Latte', exact: true }) }).click();
    }
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: /Agregar a la Orden/ })).toBeEnabled();
    await page.locator('.modal-backdrop').evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
    const dimensions = await dialog.locator('.modal-photo img').evaluate(async element => {
      const image = element as HTMLImageElement; await image.decode();
      const frame = image.parentElement!.getBoundingClientRect(); const picture = image.getBoundingClientRect();
      const body = image.closest('.modal-body')!;
      return { frameWidth: frame.width, frameHeight: frame.height, imageWidth: picture.width, imageHeight: picture.height, fit: getComputedStyle(image).objectFit, bodyWidth: body.clientWidth, bodyScrollWidth: body.scrollWidth, viewportHeight: innerHeight };
    });
    expect(dimensions.imageWidth).toBeLessThanOrEqual(dimensions.frameWidth + 1);
    expect(dimensions.imageHeight).toBeLessThanOrEqual(dimensions.frameHeight + 1);
    expect(dimensions.imageHeight).toBeLessThanOrEqual(dimensions.viewportHeight * 0.3 + 1);
    expect(dimensions.fit).toBe('contain');
    expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.bodyWidth + 1);
    const add = await dialog.getByRole('button', { name: /Agregar a la Orden/ }).boundingBox();
    expect(add!.y).toBeGreaterThanOrEqual(0);
    expect(add!.y + add!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({ path: `docs/evidence/product-photo-${surface}.png` });
  });
}
