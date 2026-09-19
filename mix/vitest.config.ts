import { defineConfig } from 'vitest/config';

// One project per module, so a run can be read — or taken — a module at a
// time: `npm test -- --project=mix/electron`, and a named group in the report
// rather than every file in one list.
const module = (name: string, include: string[]) => ({
  test: { name, include, environment: 'node' as const },
});

export default defineConfig({
  test: {
    projects: [
      module('mix', ['src/**/*.test.ts']),
      module('mix/electron', ['electron/**/*.test.ts']),
      module('mix/harness', ['harness/**/*.test.ts']),
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
        'src/**/*.{ts,tsx}',
        // Not the whole of electron/: main.ts and library.ts import electron,
        // which only exists inside a main process. These are the parts
        // that own a person's library and what gets written into it, and they
        // have no electron in them precisely so they can be reached from here.
        'electron/manifest.ts',
        'electron/job.ts',
        'electron/models.ts',
        'electron/runtime.ts',
        'electron/youtube.ts',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
    },
  },
});
