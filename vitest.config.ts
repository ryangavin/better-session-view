import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['core/src/**/*.test.ts', 'ui/src/lib/**/*.test.ts'],
    environment: 'node',
  },
});
