import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Shown when /admin is requested but the admin dev server is not running.
 *
 * Without it the request falls through to the storefront's catch-all route
 * and renders the shop's 404, which looks like the admin portal is missing
 * rather than simply not started.
 */
const ADMIN_OFFLINE = `<!doctype html>
<meta charset="utf-8">
<title>Admin portal not running</title>
<style>
  body { font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; margin: 0;
         display: grid; place-items: center; min-height: 100vh; color: #1a1718; }
  main { max-width: 34rem; padding: 2rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .75rem; }
  code { background: #f4f1f1; padding: .15rem .4rem; border-radius: .25rem; }
  p { margin: 0 0 .75rem; color: #5b5354; }
</style>
<main>
  <h1>The admin portal is not running</h1>
  <p>In development it is a second Vite server on port 5174, proxied here so
     the URL matches production.</p>
  <p>Start everything with <code>npm run dev</code>, or just the portal with
     <code>npm run dev:admin</code>, then reload.</p>
</main>`;

/**
 * `/admin` with no trailing slash is what people actually type. The admin app
 * is built with `base: '/admin/'`, so without this it answers with Vite's
 * "did you mean /admin/?" note instead of the portal. Production needs the
 * same redirect from the static host.
 */
function adminTrailingSlash(): Plugin {
  return {
    name: 'humovare-admin-trailing-slash',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [path, query] = (request.url ?? '').split('?');
        if (path !== '/admin') return next();

        response.writeHead(301, { Location: query ? `/admin/?${query}` : '/admin/' });
        response.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), adminTrailingSlash()],

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },

  server: {
    port: 5173,
    // Proxying in dev keeps the browser same-origin, so the refresh cookie
    // behaves exactly as it will in production behind one domain.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },

      /**
       * In production the admin bundle is served from /admin on this origin
       * (`npm run build` copies it into `shop/dist/admin`). Proxying the
       * admin dev server here means the same URL works in development, and
       * the admin cookies stay same-origin either way.
       */
      '/admin': {
        target: process.env.VITE_ADMIN_TARGET || 'http://localhost:5174',
        changeOrigin: false,
        configure(proxy) {
          proxy.on('error', (_error, _request, response) => {
            if (response.headersSent) return;
            response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end(ADMIN_OFFLINE);
          });
        },
      },
    },
  },

  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /**
         * Split the vendor bundle by concern rather than shipping one large
         * chunk: React and the router are needed for first paint, while
         * forms are only pulled in by the routes that use them.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('/react/') || id.includes('react-dom')) return 'vendor-react';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
            return 'vendor-forms';
          }
          return 'vendor';
        },
      },
    },
  },
});
