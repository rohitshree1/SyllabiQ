import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ensureNojekyllPlugin() {
  return {
    name: 'ensure-nojekyll',
    writeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      if (fs.existsSync(outDir)) {
        fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
      }
    },
  };
}

export default defineConfig(({command}) => {
  return {
    base: command === 'build' ? process.env.VITE_BASE_PATH || './' : '/',
    plugins: [react(), tailwindcss(), ensureNojekyllPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/data/**'] },
    },
  };
});
