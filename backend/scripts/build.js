import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const srcDir = resolve(rootDir, 'src');
const distDir = resolve(rootDir, 'dist');

function copyRecursive(source, destination) {
  const stats = statSync(source);

  if (stats.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) {
      copyRecursive(resolve(source, entry), resolve(destination, entry));
    }
    return;
  }

  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

copyRecursive(srcDir, distDir);

console.log('Build completed. Output directory:', distDir);
