// Vite for the surface harness (scripts/qa-surface-harness): the library as
// the game imports it, `@` → src, the game's public folder for the maps and
// models, and the two process.env reads the scenes make.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

export default defineConfig({
  root: here,
  publicDir: path.join(repo, 'public'),
  cacheDir: path.join(repo, process.env.QA_SRC ? 'node_modules/.vite-qa-surfaces-before' : 'node_modules/.vite-qa-surfaces'),
  resolve: { alias: { '@': process.env.QA_SRC ?? path.join(repo, 'src') } },
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.NEXT_PUBLIC_BUILD_ID': JSON.stringify('qa'),
    'process.env.NEXT_PUBLIC_SUPABASE_URL': 'undefined',
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': 'undefined',
  },
  server: { port: Number(process.env.QA_PORT ?? 3112), strictPort: true, host: '127.0.0.1', fs: { allow: [repo] } },
  logLevel: 'warn',
});
