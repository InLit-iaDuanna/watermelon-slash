import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// HTTPS is required for getUserMedia on iOS Safari over LAN (localhost is exempt).
// `pnpm dev` runs HTTP on localhost — fine for desktop browser smoke tests.
// `pnpm dev:https` (VITE_HTTPS=1) reads pre-generated mkcert certs from
// ~/.vite-plugin-mkcert/. Generate them once with:
//   CAROOT=~/.vite-plugin-mkcert ~/.vite-plugin-mkcert/mkcert \
//     -key-file ~/.vite-plugin-mkcert/dev.pem \
//     -cert-file ~/.vite-plugin-mkcert/cert.pem \
//     localhost 127.0.0.1 <your-LAN-IP>
// Then transfer ~/.vite-plugin-mkcert/rootCA.pem to your iPhone and trust it
// in Settings → General → About → Certificate Trust Settings.
const useHttps = process.env.VITE_HTTPS === '1';
const certDir = join(homedir(), '.vite-plugin-mkcert');

const httpsConfig = useHttps
  ? {
      key: readFileSync(join(certDir, 'dev.pem')),
      cert: readFileSync(join(certDir, 'cert.pem')),
    }
  : undefined;

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    https: httpsConfig,
    // 让 MediaPipe wasm 能用 SharedArrayBuffer / threads(iOS Safari 上必要)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          mediapipe: ['@mediapipe/tasks-vision'],
        },
      },
    },
  },
});
