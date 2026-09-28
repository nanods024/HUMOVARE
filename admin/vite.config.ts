import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/** The admin portal is never framed, sniffed or cached. */
const ADMIN_SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

const CHART_PACKAGES =
  /node_modules[\\/](recharts|recharts-scale|victory-vendor|d3-[^\\/]+|internmap|lodash|decimal\.js-light|react-smooth|fast-equals|eventemitter3|react-transition-group|dom-helpers|tiny-invariant|react-is|prop-types|@babel[\\/]runtime)[\\/]/;

export default defineConfig({
  plugins: [react()],

  // Served from /admin on the same host as the storefront, so every asset
  // URL has to be prefixed.
  base: '/admin/',

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },


  server: {
    port: 5174,
    // Same protections as production (see shop/public/_headers).
    headers: ADMIN_SECURITY_HEADERS,
    // The page is usually opened at http://localhost:5173/admin, through the
    // storefront's proxy. Pinning the client port keeps the HMR socket
    // pointed at this server instead of the storefront's.
    hmr: { clientPort: 5174 },
    // Proxying keeps the browser same-origin in development, so the
    // HTTP-only admin cookies behave exactly as they will in production.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  preview: {
    headers: ADMIN_SECURITY_HEADERS,
  },

  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Recharts and everything it pulls in. Only the dashboard draws
          // charts; left in the catch-all chunk these ~330 KB would load on
          // every page, the sign-in screen included.
          if (CHART_PACKAGES.test(id)) return 'vendor-charts';
          // Icons are left to Rollup, so each lazy page carries only the icons
          // it uses instead of every icon loading on the sign-in screen.
          if (id.includes('lucide-react')) return undefined;
          if (id.includes('react-router') || id.includes('@remix-run')) return 'vendor-router';
          if (id.includes('/react/') || id.includes('react-dom') || id.includes('/scheduler/')) return 'vendor-react';
          if (id.includes('@tanstack')) return 'vendor-query';
          return 'vendor';
        },
      },
    },
  },
});
