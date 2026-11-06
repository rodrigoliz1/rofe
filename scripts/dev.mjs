import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createServer } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile = resolve(root, 'backend/.env.development.local');
const localDirectory = resolve(root, '.rofe-local');
let local;
try { local = parseEnv(await readFile(profile, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  throw new Error('Falta backend/.env.development.local. Sigue docs/LOCAL_DEVELOPMENT.md.');
}
// This command is exclusively local: inherited credentials cannot enable remote services.
const env = {
  ...process.env, ...local,
  NODE_ENV: 'development', VERCEL: '', HOST: '127.0.0.1', PORT: '3000', TRUST_PROXY: '0',
  SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '',
  POINT_RECONCILIATION_ENABLED: 'false', CRON_SECRET: '',
  MERCADO_PAGO_ACCESS_TOKEN: '', MERCADO_PAGO_WEBHOOK_SECRET: '', POINT_DEVICE_ID: '',
  STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', PUBLIC_ORDERING_URL: '',
  ENABLE_PAYMENT_SIMULATION: 'true',
  ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
  VITE_API_URL: '',
  DB_FILE_PATH: resolve(localDirectory, 'db.json'),
  SECURITY_DEVICES_FILE_PATH: resolve(localDirectory, 'devices.json'),
  DOTENV_CONFIG_PATH: profile,
};
for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'AUTH_BOOTSTRAP_ADMIN_HASH', 'AUTH_BOOTSTRAP_BARISTA_HASH', 'DEVICE_ENROLLMENT_SECRET']) {
  if (!local[name]) throw new Error(`Falta ${name} en el perfil local.`);
}
for (const port of [3000, 5173]) {
  await new Promise((accept, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`El puerto ${port} está ocupado. Detén el proceso anterior antes de iniciar ROFÉ.`)));
    server.listen(port, '127.0.0.1', () => server.close(accept));
  });
}
await mkdir(localDirectory, { recursive: true, mode: 0o700 });
try { await copyFile(resolve(root, 'backend/db.json'), env.DB_FILE_PATH, constants.COPYFILE_EXCL); }
catch (error) { if (!['EEXIST', 'ENOENT'].includes(error.code)) throw error; }

console.log('ROFÉ local: JSON aislado en .rofe-local; pagos simulados; servicios remotos deshabilitados.');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['--prefix', 'backend', 'run', 'dev'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32', detached: process.platform !== 'win32' }),
  spawn(npm, ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32', detached: process.platform !== 'win32' }),
];
let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid && child.exitCode === null) {
      try {
        if (process.platform === 'win32') child.kill();
        else process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
for (const child of children) {
  child.on('error', (error) => {
    console.error(`No se pudo iniciar ROFÉ: ${error.message}`);
    process.exitCode = 1;
    stop('SIGTERM');
  });
  child.on('exit', (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop('SIGTERM');
    }
  });
}
