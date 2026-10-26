import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { aiProxyPlugin } from './server/aiProxy.mjs';

export default defineConfig(({ mode }) => {
  // Loads .env / .env.local on the server only. Nothing without a VITE_ prefix reaches the browser bundle.
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [react(), aiProxyPlugin(env)],
    server: { host: true, port: 5173 },
  };
});
