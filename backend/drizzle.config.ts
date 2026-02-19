import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle/tenant',
  schema: './src/db/tenant-schema.ts',
  dialect: 'sqlite',
});
