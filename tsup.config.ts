import { defineConfig } from 'tsup';

export default defineConfig([
  // Library — components + API handlers
  {
    entry: {
      index: 'src/index.ts',
      'api/login': 'src/api/login.ts',
      'api/save': 'src/api/save.ts',
      'api/upload': 'src/api/upload.ts',
      'api/logout': 'src/api/logout.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    external: ['react', 'next', '@octokit/rest'],
    splitting: false,
    clean: true,
  },
  // CLI — Node.js script, bundled standalone, no dts needed
  {
    entry: { 'bin/init': 'bin/init.ts' },
    format: ['cjs'],
    dts: false,
    platform: 'node',
    banner: { js: '#!/usr/bin/env node' },
    splitting: false,
  },
]);
