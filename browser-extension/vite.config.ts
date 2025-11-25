import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Build target is now set via environment variable
// Supported targets: auth, popup, sidebar
const BUILD_TARGET = process.env.BUILD_TARGET || 'auth';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': {}
  },
  build: {
    rollupOptions: {
      input: `./src/${BUILD_TARGET}.tsx`,
      output: { 
        entryFileNames: `${BUILD_TARGET}.js`, 
        assetFileNames: `${BUILD_TARGET}.[ext]`,
        format: 'iife',
        inlineDynamicImports: true,
        // Fix for Lt.filter error - ensure proper globals
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM'
        }
      },
      external: [], // Don't externalize anything for extensions
    },
    cssCodeSplit: false,
    outDir: 'dist',
    emptyOutDir: BUILD_TARGET === 'auth',
    target: 'es2020', // More compatible target
    minify: false // Disable minification to avoid variable name conflicts
  },
  resolve: {
    alias: {
      // Add buffer polyfill for browser compatibility
      buffer: 'buffer',
      process: 'process/browser'
    }
  },
  optimizeDeps: {
    include: ['buffer', 'process']
  }
});
