import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, expect, test } from 'vitest';
import { AuthService } from '../src/auth/service';
import { createSecurityStore, DevelopmentSecurityStore } from '../src/auth/store';
import type { AppEnv } from '../src/config/env';

let directory = '';
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('development profiles persist devices only in their configured directory', async () => {
  directory = await mkdtemp(join(tmpdir(), 'rofe-profile-'));
  const path = join(directory, 'devices.json');
  const env = { NODE_ENV: 'development', SECURITY_DEVICES_FILE_PATH: path } as AppEnv;
  const store = createSecurityStore(env);
  await store.initialize([]);
  await store.saveDevice({ id: 'isolated-device', name: 'Local only', tokenHash: 'hash-only', active: true, createdAt: new Date().toISOString() });
  const restored = createSecurityStore(env);
  await restored.initialize([]);
  expect((await restored.findDevice('isolated-device'))?.name).toBe('Local only');
  expect(JSON.parse(await readFile(path, 'utf8'))).toHaveLength(1);
});

test('development device authorization survives a restart and revocation remains effective', async () => {
  directory = await mkdtemp(join(tmpdir(), 'rofe-device-'));
  const path = join(directory, 'devices.json');
  const env = { DEVICE_ENROLLMENT_SECRET: 'enrollment-test-secret', JWT_ACCESS_SECRET: 'access-secret-for-tests-32-characters-long', JWT_REFRESH_SECRET: 'refresh-secret-for-tests-32-characters-long' } as AppEnv;
  const firstStore = new DevelopmentSecurityStore(path);
  const first = new AuthService(env, firstStore);
  await first.initialize();
  const device = await first.registerDevice('Terminal de prueba', env.DEVICE_ENROLLMENT_SECRET!);
  expect(await readFile(path, 'utf8')).not.toContain(device.deviceToken);

  const restoredStore = new DevelopmentSecurityStore(path);
  const restored = new AuthService(env, restoredStore);
  await restored.initialize();
  expect((await restored.loginDevice(device.deviceId, device.deviceToken)).principal.role).toBe('POS_DEVICE');
  await restoredStore.revokeDevice(device.deviceId, new Date().toISOString());

  const restartedStore = new DevelopmentSecurityStore(path);
  const restarted = new AuthService(env, restartedStore);
  await restarted.initialize();
  await expect(restarted.loginDevice(device.deviceId, device.deviceToken)).rejects.toThrow();
});
