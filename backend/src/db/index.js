import pkg from 'pg';
import dotenv from 'dotenv';
import logger from '../logger.js';

dotenv.config();

const { Pool } = pkg;

const {
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASS,
  DB_NAME
} = process.env;

const poolConfig = DATABASE_URL
  ? { connectionString: DATABASE_URL }
  : {
      host: DB_HOST,
      port: DB_PORT ? Number(DB_PORT) : undefined,
      user: DB_USER,
      password: DB_PASS == null ? '' : String(DB_PASS),
      database: DB_NAME
    };

const pool = new Pool(poolConfig);
export { pool };

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

let warmupPool;

function getWarmupPool() {
  const { CAL_HOST, CAL_NAME, CAL_USER, CAL_PASS, CAL_PORT } = process.env;

  if (!CAL_HOST || !CAL_NAME || !CAL_USER) {
    return null;
  }

  if (!warmupPool) {
    const warmupPort = CAL_PORT ? Number(CAL_PORT) : undefined;
    const fallbackPort = !warmupPort && process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;

    warmupPool = new Pool({
      host: CAL_HOST,
      database: CAL_NAME,
      user: CAL_USER,
      password: CAL_PASS == null ? '' : String(CAL_PASS),
      port: warmupPort ?? fallbackPort
    });

    warmupPool.on('error', (err) => {
      logger.error('Unexpected error on calentador PostgreSQL client', err);
    });
  }

  return warmupPool;
}

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();

export async function queryWarmup(text, params) {
  const currentPool = getWarmupPool();
  if (!currentPool) {
    throw new Error('Calentador database is not configured');
  }

  return currentPool.query(text, params);
}
