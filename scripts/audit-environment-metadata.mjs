import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Accepts API metadata; deliberately never copies values, IDs, owners or timestamps. */
export function auditEnvironmentMetadata(metadata) {
  const rows = (metadata.envs ?? []).map(record => ({
    name: record.key,
    targets: Array.isArray(record.target) ? [...record.target].sort() : [],
    branchSpecific: Boolean(record.gitBranch),
    storage: record.type,
    recordExists: true,
  })).sort((a, b) => a.name.localeCompare(b.name));
  const shared = rows.filter(row => row.targets.includes('production') && row.targets.some(target => target !== 'production'));
  return { status: shared.length ? 'ISOLATION_REQUIRED' : 'SCOPES_SEPARATED', rows, sharedNames: [...new Set(shared.map(row => row.name))] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = auditEnvironmentMetadata(JSON.parse(readFileSync(0, 'utf8')));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.sharedNames.length) process.exitCode = 1;
  } catch {
    process.stderr.write('No se pudieron validar los metadatos; contenido omitido.\n');
    process.exitCode = 2;
  }
}
