const { rmSync } = require('node:fs');
const { spawn } = require('node:child_process');
const { join } = require('node:path');

const databasePath = '/tmp/rofe-e2e-db.json';
rmSync(databasePath, { force: true });

const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: join(process.cwd(), 'backend'),
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', MERCADO_PAGO_ACCESS_TOKEN: '', MERCADO_PAGO_WEBHOOK_SECRET: '', POINT_DEVICE_ID: '',
    STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', PUBLIC_ORDERING_URL: '',
    PORT: '3100',
    API_RATE_LIMIT_MAX: '2000',
    ALLOWED_ORIGINS: 'http://127.0.0.1:4173',
    JWT_ACCESS_SECRET: 'e2e-access-secret-12345678901234567890',
    JWT_REFRESH_SECRET: 'e2e-refresh-secret-123456789012345678',
    AUTH_BOOTSTRAP_ADMIN_EMAIL: 'admin@rofe.test',
    AUTH_BOOTSTRAP_ADMIN_HASH: '$2b$04$JQi.d6Imx6difkoQ44MRpurCCn9m7VqL0U7Amhct090Q9yyJLH9ey',
    AUTH_BOOTSTRAP_BARISTA_EMAIL: 'barista@rofe.test',
    AUTH_BOOTSTRAP_BARISTA_HASH: '$2b$04$OE23mIMmedQf1gsKBnDIEOTVGEI25r2cCBfld4oFnBtWcRCE.UGOG',
    DEVICE_ENROLLMENT_SECRET: 'e2e-device-enrollment-secret',
    ENABLE_PAYMENT_SIMULATION: 'true',
    DB_FILE_PATH: databasePath,
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
