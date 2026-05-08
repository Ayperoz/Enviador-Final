import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function resolveServerOptions(env) {
  let host = '0.0.0.0';
  let port = 3000;

  if (env.VITE_FRONTEND_URL) {
    try {
      const parsed = new URL(env.VITE_FRONTEND_URL);
      host = parsed.hostname || host;
      if (parsed.port) {
        port = Number(parsed.port);
      } else if (parsed.protocol === 'https:') {
        port = 443;
      } else if (parsed.protocol === 'http:') {
        port = 80;
      }
    } catch (error) {
      console.warn('No se pudo interpretar VITE_FRONTEND_URL, se usarán valores por defecto.');
    }
  }

  if (env.VITE_FRONTEND_PORT) {
    const parsedPort = Number(env.VITE_FRONTEND_PORT);
    if (!Number.isNaN(parsedPort)) {
      port = parsedPort;
    }
  }

  if (env.VITE_FRONTEND_HOST) {
    host = env.VITE_FRONTEND_HOST;
  }

  return { host, port };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const server = resolveServerOptions(env);

  return {
    plugins: [react()],
    server,
    build: {
      outDir: 'build',
      emptyOutDir: true
    }
  };
});
