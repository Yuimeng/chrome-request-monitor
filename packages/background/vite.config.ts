import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../../dist/background',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'background.js',
      },
    },
  },
});
