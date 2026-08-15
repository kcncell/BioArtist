import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxies avoid browser CORS when resolving UniProt / RCSB structure images.
// ELECTRON=1 → relative base so the packaged app can load assets correctly.
const isElectron = process.env.ELECTRON === '1';

export default defineConfig({
  plugins: [react()],
  base: isElectron ? './' : '/',
  // Ketcher / indigo-ketcher reference Node globals in browser builds
  define: {
    global: 'globalThis',
    'process.env': JSON.stringify({
      NODE_ENV: process.env.NODE_ENV || 'development',
      PUBLIC_URL: '',
    }),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.PUBLIC_URL': JSON.stringify(''),
  },
  // Ketcher / Indigo WASM (Chem Studio only)
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    include: [
      'ketcher-core',
      'ketcher-react',
      'ketcher-standalone',
      'indigo-ketcher',
      '3dmol/build/3Dmol.es6.js',
    ],
  },
  worker: {
    format: 'es',
  },
  server: {
    proxy: {
      '/api/uniprot': {
        target: 'https://rest.uniprot.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/uniprot/, ''),
      },
      '/api/rcsb-search': {
        target: 'https://search.rcsb.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/rcsb-search/, ''),
      },
      '/api/rcsb-data': {
        target: 'https://data.rcsb.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/rcsb-data/, ''),
      },
      '/api/rcsb-img': {
        target: 'https://cdn.rcsb.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/rcsb-img/, ''),
      },
    },
  },
});
