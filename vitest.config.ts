import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run tests in single process to avoid DB race conditions
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',
      ],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70
      }
    },
    // Mongoose setup hooks
    globalSetup: './tests/helpers/global-setup.ts',
    setupFiles: ['./tests/helpers/setup.ts'],
    testTimeout: 10000,
  }
});
