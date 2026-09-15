import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({ absWorkingDir: root, entryPoints: ['surface/data-app.mjs'], bundle: true, format: 'esm',
  outfile: 'dist/instrument.mjs', sourcemap: true, target: ['es2022'], logLevel: 'info',
  minify: process.argv.includes('--minify'), legalComments: 'eof' });
await build({ absWorkingDir: root, entryPoints: ['surface/app.mjs'], bundle: true, format: 'esm',
  outfile: 'dist/legacy-instrument.mjs', sourcemap: true, target: ['es2022'], logLevel: 'info',
  minify: process.argv.includes('--minify'), legalComments: 'eof' });
