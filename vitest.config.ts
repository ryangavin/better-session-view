import { defineConfig } from 'vitest/config';

// One project per module, so a run can be read — or taken — a module at a
// time: `npm test -- --project=visuals`, and a named group in the report
// rather than seventy-eight files in one list.
const module = (name: string, include: string[]) => ({
  test: { name, include, environment: 'node' as const },
});

export default defineConfig({
  test: {
    projects: [
      module('core', ['core/src/**/*.test.ts']),
      module('widgets', ['widgets/src/**/*.test.ts']),
      module('set', ['set/src/lib/**/*.test.ts', 'set/src/components/**/*.test.ts']),
      module('visuals', ['visuals/**/*.test.ts']),
      module('chart', ['chart/**/*.test.ts']),
    ],
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
