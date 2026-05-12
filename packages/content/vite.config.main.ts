import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../../dist/content',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/main-world.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'main.js',
      },
    },
  },
});
