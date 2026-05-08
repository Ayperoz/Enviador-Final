import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [salt, key] = storedHash.split(':');
  const storedBuffer = Buffer.from(key, 'hex');

  if (storedBuffer.length !== KEY_LENGTH) {
    return false;
  }

  const derived = scryptSync(password, salt, KEY_LENGTH);

  return timingSafeEqual(derived, storedBuffer);
}
