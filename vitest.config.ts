import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        compatibilityDate: '2026-08-28',
        d1Databases: ['DB'],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')),
          BOOTSTRAP_SECRET: 'integration-bootstrap-secret-with-32-characters',
          ENVIRONMENT: 'test',
          APP_VERSION: '0.1.0-test',
          APP_COMMIT: 'test',
        },
      },
    })),
  ],
  test: {
    include: ['tests/{unit,integration}/**/*.test.ts'],
    setupFiles: ['./tests/apply-migrations.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
