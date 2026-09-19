import { defineConfig } from 'vitest/config';

// One project per module, so a run can be read — or taken — a module at a
// time: `npm test -- --project=chart`, and a named group in the report
// rather than seventy-eight files in one list.
const module = (name: string, include: string[], exclude?: string[]) => ({
  test: { name, include, exclude, environment: 'node' as const },
});

export default defineConfig({
  test: {
    projects: [
      module('set', [
        'set/src/lib/**/*.test.ts',
        'set/src/components/**/*.test.ts',
        'set/src/hooks/**/*.test.ts',
      ]),
      module('chart', ['chart/**/*.test.ts']),
    ],
    // Vitest 5's HTML reporter takes a directory rather than outputFile.
    // Keep report/ as the complete publishable site, including coverage.
    reporters: ['default', ['html', { outputDir: 'report' }]],
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
        'set/src/**/*.{ts,tsx}',
        'chart/src/**/*.{ts,tsx}',
        'chart/server/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
    },
  },
});
