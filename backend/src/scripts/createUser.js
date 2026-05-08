import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { query } from '../db/index.js';
import { initDb } from '../db/init.js';
import { hashPassword } from '../utils/password.js';
import logger from '../logger.js';

async function promptCredentials() {
  const rl = readline.createInterface({ input, output });
  try {
    const username = await rl.question('Usuario: ');
    const password = await rl.question('Contraseña: ', { hideEchoBack: true });
    return { username, password };
  } finally {
    rl.close();
  }
}

async function main() {
  await initDb();
  const { username, password } = await promptCredentials();

  if (!username || !password) {
    logger.error('Usuario y contraseña son obligatorios.');
    process.exit(1);
  }

  const hash = hashPassword(password);

  try {
    await query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;`,
      [username, hash]
    );
    logger.info('Usuario guardado correctamente.');
    process.exit(0);
  } catch (error) {
    logger.error('No se pudo guardar el usuario:', error.message);
    process.exit(1);
  }
}

main();
