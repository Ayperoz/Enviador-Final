import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ENV_FILE_PATH = path.resolve(__dirname, '../../.env');

export async function setEnvValue(key, value) {
  const normalizedKey = String(key).trim();
  const normalizedValue = typeof value === 'string' ? value.trim() : String(value ?? '');

  if (!normalizedKey) {
    throw new Error('Clave de entorno inválida.');
  }

  let content = '';

  try {
    content = await fs.readFile(ENV_FILE_PATH, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const pattern = new RegExp(`^${normalizedKey}\\s*=.*$`, 'm');
  let nextContent;

  if (pattern.test(content)) {
    nextContent = content.replace(pattern, `${normalizedKey}=${normalizedValue}`);
  } else {
    const trimmed = content.trimEnd();
    nextContent = trimmed ? `${trimmed}\n${normalizedKey}=${normalizedValue}\n` : `${normalizedKey}=${normalizedValue}\n`;
  }

  if (!nextContent.endsWith('\n')) {
    nextContent += '\n';
  }

  await fs.writeFile(ENV_FILE_PATH, nextContent, 'utf8');
  process.env[normalizedKey] = normalizedValue;
}

export function getIntFromEnv(key, { allowZero = false } = {}) {
  const rawValue = process.env[key];
  if (rawValue == null || rawValue === '') {
    return null;
  }

  const parsed = Number.parseInt(String(rawValue), 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (allowZero) {
    return parsed >= 0 ? parsed : null;
  }

  return parsed > 0 ? parsed : null;
}

export function getBooleanFromEnv(key) {
  const rawValue = process.env[key];
  if (rawValue == null) {
    return null;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return null;
}

export function booleanToEnvValue(value) {
  return value ? 'true' : 'false';
}
