import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'fixtures/**/*.test.ts', 'apps/**/*.test.ts'],
    // Never scan build output — the packaged app under apps/desktop/release/ and the compiled
    // apps/*/out/ copy plugin test files (which use bun:test) that vitest must not pick up.
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/release/**'],
    environment: 'node',
    coverage: { reporter: ['text', 'html'] },
  },
})
