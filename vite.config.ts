import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron';

// Production builds get a strict Content-Security-Policy. Dev skips it because the dev server
// injects inline scripts for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'faber-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3', 'playwright']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs'
              }
            }
          }
        },
        onstart(options) {
          options.reload();
        },
      },
    ]),
  ],
  base: './',
});
