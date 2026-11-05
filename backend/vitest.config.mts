import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Test-only secrets so suites that import the db module (which reads the env) work without a local .env.
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'access-secret-for-tests-only-1234567890',
      JWT_REFRESH_SECRET: 'refresh-secret-for-tests-only-123456789',
    },
    include: ['tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'], include: ['src/domain/**/*.ts', 'src/payments/**/*.ts', 'src/middleware/**/*.ts'] },
  },
});
