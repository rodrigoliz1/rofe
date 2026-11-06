import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Test-only secrets so suites that import the db module (which reads the env) work without a local .env.
    env: {
      NODE_ENV: 'test',
      // Never inherit live integrations from backend/.env or the invoking shell.
      SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '',
      POINT_RECONCILIATION_ENABLED: 'false', CRON_SECRET: '',
      MERCADO_PAGO_ACCESS_TOKEN: '', MERCADO_PAGO_WEBHOOK_SECRET: '', POINT_DEVICE_ID: '',
      STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', PUBLIC_ORDERING_URL: '',
      VERCEL: '',
      JWT_ACCESS_SECRET: 'access-secret-for-tests-only-1234567890',
      JWT_REFRESH_SECRET: 'refresh-secret-for-tests-only-123456789',
    },
    include: ['tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'], include: ['src/domain/**/*.ts', 'src/payments/**/*.ts', 'src/middleware/**/*.ts'] },
  },
});
