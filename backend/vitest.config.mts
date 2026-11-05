import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'], include: ['src/domain/**/*.ts', 'src/payments/**/*.ts', 'src/middleware/**/*.ts'] },
  },
});
