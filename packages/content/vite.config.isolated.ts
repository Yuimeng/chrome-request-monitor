import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../../dist/content',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/isolated-world.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'isolated.js',
      },
    },
  },
});
