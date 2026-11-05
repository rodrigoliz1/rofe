import { chromium, devices } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const input = args.includes('--url') ? option('--url') : undefined;
if (!input) throw new Error('Uso: npm run audit:pwa -- --url https://tu-dominio/kiosk [--report archivo.json]. Para build local: --local --url http://localhost:4173/kiosk');
const target = new URL(input);
const local = args.includes('--local') && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
if (target.protocol !== 'https:' && !(local && target.protocol === 'http:')) throw new Error('La auditoría exige HTTPS válido. --local sólo admite loopback y nunca convierte una IP LAN HTTP en contexto seguro.');
const report = { checkedAtUtc: new Date().toISOString(), target: target.href, context: local ? 'Build de producción en loopback; no valida un deployment HTTPS' : 'Deployment HTTPS con validación TLS normal', issues: [], resources: [], browser: null };
const issue = (message) => report.issues.push(message);
async function resource(url, kind) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { 'Cache-Control': 'no-cache' } });
    const record = { url, status: response.status, contentType: response.headers.get('content-type'), redirect: response.headers.get('location') };
    report.resources.push(record);
    if (response.status !== 200) { issue(`${kind}: HTTP ${response.status}${record.redirect ? ` → ${record.redirect}` : ''}`); return null; }
    if (kind === 'manifest' && !record.contentType?.includes('application/manifest+json')) issue('El manifest no se sirve como application/manifest+json.');
    if (kind === 'service worker' && !/javascript/.test(record.contentType ?? '')) issue('El worker no tiene Content-Type JavaScript.');
    if (kind.startsWith('icono ') && !record.contentType?.includes('image/png')) issue(`${kind}: Content-Type distinto de image/png.`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) { issue(`${kind}: ${error.message}`); return null; }
}
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (response?.status() !== 200) issue(`Página de instalación: HTTP ${response?.status()}`);
  if (!local && new URL(page.url()).protocol !== 'https:') issue('La navegación salió de HTTPS.');
  if (new URL(page.url()).origin !== target.origin) issue(`La página redirige a otro origen: ${new URL(page.url()).origin}`);
  const environment = await page.evaluate(() => ({ secureContext: isSecureContext, workerSupported: 'serviceWorker' in navigator, manifestLink: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null }));
  if (!environment.secureContext) issue('El navegador no reconoce un contexto seguro.');
  if (!environment.manifestLink) issue('El documento publicado no enlaza un manifest.');
  const origin = new URL(page.url()).origin;
  const manifestUrl = new URL(environment.manifestLink ?? '/manifest.webmanifest', page.url());
  const manifestBytes = await resource(manifestUrl.href, 'manifest');
  let manifest;
  try { manifest = manifestBytes ? JSON.parse(manifestBytes.toString()) : null; }
  catch { issue('El manifest no contiene JSON válido.'); }
  if (manifest) {
    for (const field of ['name', 'short_name', 'id', 'start_url', 'scope', 'orientation', 'theme_color', 'background_color']) if (!manifest[field]) issue(`Falta ${field}.`);
    if (!['standalone', 'fullscreen'].includes(manifest.display)) issue('display no solicita una experiencia independiente.');
    if (manifest.prefer_related_applications === true) issue('El manifest desvía la instalación a una aplicación relacionada.');
    const start = new URL(manifest.start_url ?? '/', manifestUrl);
    const scope = new URL(manifest.scope ?? '/', manifestUrl);
    if (start.origin !== origin || scope.origin !== origin || !start.pathname.startsWith(scope.pathname)) issue('start_url está fuera del scope/origen.');
    if (start.pathname !== '/kiosk') issue('La aplicación instalada no arranca en /kiosk.');
    if (manifest.orientation !== 'any') issue('La instalación debe permitir vertical y horizontal (orientation: any).');
    if (/localhost|127\.0\.0\.1|192\.168\.|:5173|:4173/.test(JSON.stringify(manifest))) issue('El manifest contiene direcciones de desarrollo.');
    await resource(start.href, 'start_url');
    for (const icon of manifest.icons ?? []) {
      const url = new URL(icon.src, manifestUrl);
      if (url.origin !== origin) issue(`Icono externo: ${icon.src}`);
      const bytes = await resource(url.href, `icono ${icon.src}`);
      if (bytes) {
        try {
          const png = PNG.sync.read(bytes);
          if (icon.type !== 'image/png' || icon.sizes !== `${png.width}x${png.height}`) issue(`Dimensiones/formato incorrectos: ${icon.src}`);
          if (icon.purpose === 'maskable' && png.data.some((alpha, index) => index % 4 === 3 && alpha !== 255)) issue(`Maskable con transparencia: ${icon.src}`);
        } catch { issue(`PNG inválido: ${icon.src}`); }
      }
    }
    for (const size of ['192x192', '512x512']) for (const purpose of ['any', 'maskable']) if (!manifest.icons?.some((icon) => icon.sizes === size && icon.purpose === purpose)) issue(`Falta icono ${size} ${purpose}.`);
  }
  const worker = await resource(`${origin}/sw.js`, 'service worker');
  if (worker) {
    const source = worker.toString();
    if (source.includes('__ROFE_')) issue('Se publicó una plantilla de worker sin compilar.');
    const shell = source.match(/const SHELL = (\[[^\n]+\]);/)?.[1];
    if (shell) for (const asset of JSON.parse(shell)) await resource(new URL(asset, origin).href, `precarga ${asset}`);
  }
  let registration = null;
  if (environment.secureContext && environment.workerSupported && worker) {
    try {
      await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', undefined, { timeout: 15_000 });
      registration = await page.evaluate(async () => {
        const worker = await navigator.serviceWorker.getRegistration(location.href);
        return worker ? { scope: worker.scope, script: worker.active?.scriptURL, state: worker.active?.state } : null;
      });
      if (registration?.scope !== `${origin}/`) issue('El worker no controla el scope raíz correspondiente.');
    } catch { issue('El service worker no tomó control de la página en 15 segundos.'); }
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const parsedManifest = await cdp.send('Page.getAppManifest');
  for (const error of parsedManifest.errors ?? []) issue(`Chrome manifest: ${error.message}`);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  for (const error of installability.installabilityErrors ?? []) issue(`Chrome installability: ${error.errorId}`);
  let offlineKiosk = false;
  if (registration) {
    await context.setOffline(true);
    await page.goto(new URL('/kiosk', origin).href, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    try { await page.locator('[data-kiosk="true"]').waitFor({ timeout: 8000 }); offlineKiosk = true; }
    catch { issue('El shell /kiosk no arranca sin red después de activar el worker.'); }
    await context.setOffline(false);
  }
  const pwaConsoleErrors = consoleErrors.filter((message) => /manifest|service.?worker|sw\.js|install|webapk|\[ROFÉ PWA\]/i.test(message));
  pwaConsoleErrors.forEach((message) => issue(`Consola PWA: ${message}`));
  pageErrors.forEach((message) => issue(`Error de aplicación: ${message}`));
  report.browser = { name: 'Chromium con Android emulado; no prueba el empaquetado WebAPK del dispositivo', ...environment, registration, offlineKiosk, parsedManifest: parsedManifest.manifest, installability, pwaConsoleErrors, applicationConsoleErrors: consoleErrors.filter((message) => !pwaConsoleErrors.includes(message)), pageErrors };
  await context.close();
} catch (error) { issue(`Auditoría de navegador: ${error.message}`); }
finally { await browser?.close(); }
report.status = report.issues.length ? 'FAIL' : 'PASS';
console.log(JSON.stringify(report, null, 2));
if (args.includes('--report')) await writeFile(option('--report'), JSON.stringify(report, null, 2));
if (report.issues.length) process.exitCode = 1;
