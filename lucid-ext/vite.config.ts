import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'path';

const buildTarget = process.env.BUILD_TARGET || 'popup';

// Define entry points for each target
const entries = {
  popup: resolve(__dirname, 'src/main.tsx'),
  auth: resolve(__dirname, 'src/auth.tsx'),
  content: resolve(__dirname, 'src/content.ts'),
  background: resolve(__dirname, 'src/background.ts'),
};

// Define output file names for each target
const outFiles = {
  popup: 'popup',
  auth: 'auth',
  content: 'content',
  background: 'background',
};

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
    // Exclude test files from the build
    {
      name: 'exclude-test-files',
      resolveId(id) {
        // Exclude test .pem files from node_modules
        if (id.includes('test_') && id.endsWith('.pem')) {
          return { id, external: true };
        }
        return null;
      },
    },
  ],
  build: {
    outDir: buildTarget === 'popup' ? 'build' : 'dist',
    emptyOutDir: buildTarget === 'popup',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      input: entries[buildTarget as keyof typeof entries],
      output: {
        entryFileNames: `${outFiles[buildTarget as keyof typeof outFiles]}.js`,
        chunkFileNames: `chunks/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
        format: 'iife',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
  },
});
