import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

// Render the repository's vector mark, keeping icon generation deterministic.
// Maskable artwork has a full opaque ground; the mark fits the 40% safe circle.
const source = await readFile('public/favicon.svg', 'utf8');
for (const maskable of [false, true]) {
  const svg = maskable ? source.replace(' rx="14"', '') : source;
  for (const size of [192, 512]) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
    const path = `public/icon-${maskable ? 'maskable-' : ''}${size}.png`;
    await writeFile(path, png);
    console.log(`${path}: ${size}×${size}, ${maskable ? 'maskable' : 'any'}`);
  }
}
