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
    // Where `--reporter=html` lands. The reporter copies the coverage report
    // in beside itself, so report/ is the whole publishable site.
    outputFile: { html: 'report/index.html' },
    coverage: {
      provider: 'v8',
      // Off by default, which means a failing run writes no report at all —
      // and a failing run is when the report is most worth having.
      reportOnFailure: true,
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // Spelled out rather than inferred from what the tests imported: a file
      // nobody imports is the interesting case, and it should read 0% rather
      // than go missing.
      include: [
        'core/src/**/*.{ts,tsx}',
        'widgets/src/**/*.{ts,tsx}',
        'set/src/**/*.{ts,tsx}',
        'visuals/src/**/*.{ts,tsx}',
        'visuals/server/**/*.{ts,tsx}',
        'chart/src/**/*.{ts,tsx}',
        'chart/server/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
    },
  },
});
