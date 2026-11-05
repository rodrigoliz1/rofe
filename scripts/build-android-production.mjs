import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const signing = JSON.parse(await readFile(resolve(homedir(), 'Library/Application Support/ROFE/AndroidSigning/signing.json'), 'utf8'));
const env = { ...process.env };
env.JAVA_HOME ||= resolve(root, '.rofe-local/android-toolchain/jdk-17.0.21+9/Contents/Home');
env.ANDROID_HOME ||= resolve(root, '.rofe-local/android-toolchain/sdk');
for (const kind of ['kiosk', 'barista']) {
  const data = signing[kind];
  if (!data?.file || !data.storePassword || !data.keyPassword || !data.alias) throw new Error('Falta la configuración de firma privada.');
  const prefix = kind === 'barista' ? 'ROFE_BARISTA_' : 'ROFE_';
  Object.assign(env, { [prefix + 'KEYSTORE_FILE']: data.file, [prefix + 'KEYSTORE_PASSWORD']: data.storePassword, [prefix + 'KEY_PASSWORD']: data.keyPassword, [prefix + 'KEY_ALIAS']: data.alias });
}
const run = (program, args, capture = false) => {
  const result = spawnSync(program, args, { cwd: root, env, encoding: capture ? 'utf8' : undefined, stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error('Falló una comprobación de compilación/firma; revisa el informe privado.');
  return result.stdout;
};
run('android-kiosk/gradlew', ['-p', 'android-kiosk', '--no-daemon', '--max-workers=2', ':app:assembleRelease', ':barista:assembleRelease']);
const output = resolve(root, 'android-kiosk/dist/production');
await mkdir(output, { recursive: true });
const sums = [];
for (const [module, name] of [['app', 'ROFE-Kiosco'], ['barista', 'ROFE-Barista']]) {
  const source = resolve(root, `android-kiosk/${module}/build/outputs/apk/release/${module}-release.apk`);
  const report = run(resolve(env.ANDROID_HOME, 'build-tools/34.0.0/apksigner'), ['verify', '--verbose', '--print-certs', source], true);
  await copyFile(source, resolve(output, `${name}.apk`));
  await writeFile(resolve(output, `${name}-signature.txt`), report);
  const digest = createHash('sha256').update(await readFile(source)).digest('hex');
  sums.push(`${digest}  ${name}.apk`);
  console.log(`${name}: firma verificada; SHA-256 ${digest}`);
}
await writeFile(resolve(output, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log('APKs HTTPS de producción:', output);
