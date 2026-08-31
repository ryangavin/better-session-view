import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'core/src/**/*.test.ts',
      'widgets/src/**/*.test.ts',
      'set/src/lib/**/*.test.ts',
      'set/src/components/**/*.test.ts',
      'visuals/**/*.test.ts',
      'chart/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'core/src/**/*.ts',
        'widgets/src/**/*.ts',
        'set/src/**/*.ts',
        'visuals/src/**/*.ts',
        'visuals/server/**/*.ts',
        'chart/src/**/*.ts',
        'chart/server/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
});
