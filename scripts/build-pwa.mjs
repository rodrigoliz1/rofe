import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const outputDirectory = process.env.ROFE_BUILD_OUT_DIR || 'dist';
const files = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await scan(name);
    else if (!name.endsWith('/sw.js')) files.push(name);
  }
}
await scan(outputDirectory); files.sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(file));
const precache = files.map((file) => file.slice(outputDirectory.length)).map((file) => file === '/index.html' ? '/' : file);
precache.push('/kiosk');
const template = await readFile('public/sw.js', 'utf8');
await writeFile(`${outputDirectory}/sw.js`, template.replace('__ROFE_VERSION__', hash.digest('hex').slice(0, 16)).replace("['__ROFE_PRECACHE__']", JSON.stringify(precache)));
console.log(`PWA: ${precache.length} build assets precached, API requests excluded.`);
