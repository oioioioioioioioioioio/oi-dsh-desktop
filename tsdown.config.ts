import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: {
      main: 'src/main.ts',
      launcher: 'src/launcher.ts',
    },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    dts: true,
    clean: true,
    external: ['electron', 'electron/main', /^@deepseek-ai\//, 'oi-dsh-desktop-bundle'],
  },
  {
    entry: { preload: 'src/preload.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    external: ['electron'],
    outputOptions: { entryFileNames: 'preload.cjs' },
  },
])
