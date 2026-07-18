import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxies avoid browser CORS when resolving UniProt / RCSB structure images.
export default defineConfig({
  plugins: [react()],
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
