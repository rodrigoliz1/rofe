import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const directory = resolve(process.env.ROFE_BUILD_OUT_DIR || 'dist');
const manifest = JSON.parse(await readFile(`${directory}/manifest.webmanifest`, 'utf8'));
const origin = 'https://rofe-build.invalid';
const rootUrl = (value, field) => {
  assert.equal(typeof value, 'string', `${field}: falta una ruta`);
  assert(value.startsWith('/') && !value.startsWith('//'), `${field}: debe ser una ruta relativa al origen`);
  const url = new URL(value, origin);
  assert.equal(url.origin, origin, `${field}: origen externo`);
  assert(!/localhost|127\.0\.0\.1|192\.168\.|:\d{2,5}/i.test(value), `${field}: contiene una dirección de desarrollo`);
  return url;
};
assert(manifest.name?.trim() && manifest.short_name?.trim(), 'Falta name/short_name');
assert.equal(manifest.id, '/', 'id debe conservar la identidad anterior de la aplicación');
assert.equal(manifest.start_url, '/kiosk');
const start = rootUrl(manifest.start_url, 'start_url');
const scope = rootUrl(manifest.scope, 'scope');
assert(start.pathname.startsWith(scope.pathname), 'start_url está fuera del scope');
assert(['standalone', 'fullscreen'].includes(manifest.display), 'display abre controles del navegador');
assert.equal(manifest.orientation, 'any'); // The kiosk supports portrait and landscape.
assert(/^#[a-f\d]{6}$/i.test(manifest.theme_color) && /^#[a-f\d]{6}$/i.test(manifest.background_color), 'Colores inválidos');
assert.notEqual(manifest.prefer_related_applications, true);
const icons = [];
for (const icon of manifest.icons) {
  const url = rootUrl(icon.src, 'icon.src');
  assert.equal(icon.type, 'image/png');
  const bytes = await readFile(`${directory}${url.pathname}`);
  const png = PNG.sync.read(bytes);
  assert.equal(icon.sizes, `${png.width}x${png.height}`, `Dimensiones falsas: ${icon.src}`);
  assert.equal(png.width, png.height);
  assert(['any', 'maskable'].includes(icon.purpose), 'Cada propósito debe tener su icono propio');
  if (icon.purpose === 'maskable') {
    const background = [0x11, 0x13, 0x11];
    for (let index = 0; index < png.data.length; index += 4) {
      assert.equal(png.data[index + 3], 255, `${icon.src}: maskable contiene transparencia`);
      const foreground = background.some((channel, component) => Math.abs(channel - png.data[index + component]) > 8);
      if (foreground) {
        const pixel = index / 4;
        const radius = Math.hypot((pixel % png.width) + .5 - png.width / 2, Math.floor(pixel / png.width) + .5 - png.height / 2);
        assert(radius <= png.width * .4, `${icon.src}: el logotipo sale del área segura maskable`);
      }
    }
  }
  icons.push({ path: icon.src, size: icon.sizes, purpose: icon.purpose, bytes: bytes.length });
}
for (const size of ['192x192', '512x512']) for (const purpose of ['any', 'maskable']) {
  assert(icons.some((icon) => icon.size === size && icon.purpose === purpose), `Falta ${size} ${purpose}`);
}
const html = await readFile(`${directory}/index.html`, 'utf8');
assert(html.includes('rel="manifest" href="/manifest.webmanifest"'), 'El HTML no enlaza el manifest');
const sw = await readFile(`${directory}/sw.js`, 'utf8');
assert(!sw.includes('__ROFE_'), 'Se publicó la plantilla de desarrollo del worker');
assert(/rofe-shell-[a-f0-9]{16}/.test(sw), 'Worker sin versión de build');
const shell = JSON.parse(sw.match(/const SHELL = (\[[^\n]+\]);/)?.[1] || 'null');
assert(shell?.includes('/kiosk') && shell.includes('/'), 'La entrada instalada no está precargada');
for (const asset of shell) {
  rootUrl(asset, 'precache');
  assert(!asset.startsWith('/api/'), 'La precarga incluye datos privados');
  if (!['/', '/kiosk'].includes(asset)) await readFile(`${directory}${asset}`);
}
const hosting = JSON.parse(await readFile('vercel.json', 'utf8'));
const headers = (path) => Object.fromEntries(hosting.headers.find((rule) => rule.source === path)?.headers.map(({ key, value }) => [key.toLowerCase(), value]) ?? []);
assert(headers('/manifest.webmanifest')['content-type']?.startsWith('application/manifest+json'), 'Falta Content-Type del manifest en hosting');
assert.equal(headers('/sw.js')['service-worker-allowed'], '/');
console.log(JSON.stringify({ status: 'PASS', directory, name: manifest.name, id: manifest.id, startUrl: manifest.start_url, scope: manifest.scope, display: manifest.display, orientation: manifest.orientation, icons, precachedResources: shell.length }, null, 2));
