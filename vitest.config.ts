import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'core/src/**/*.test.ts',
      'widgets/src/**/*.test.ts',
      'ui/src/lib/**/*.test.ts',
      'ui/src/components/**/*.test.ts',
      'visuals/**/*.test.ts',
      'chart/**/*.test.ts',
    ],
    environment: 'node',
  },
});
