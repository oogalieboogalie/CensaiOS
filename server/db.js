import pg from 'pg';
import { createLogger } from './logger.js';

const log = createLogger('db');

export function createDbPool(connectionString = process.env.DATABASE_URL || 'postgresql://homebase:homebase@localhost:5432/homebase') {
  let isLocal = true;
  try {
    if (connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')) {
      const url = new URL(connectionString);
      const host = url.hostname;
      isLocal = host === 'localhost' || host === '127.0.0.1' || host === 'postgres' || host === 'homebase-postgres';
    }
  } catch (e) {
    isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  }

  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });

  let host = 'unknown';
  try { host = new URL(connectionString).host; } catch { /* keep default */ }
  log.info('creating Postgres pool', { host, ssl: !isLocal, max: 10 });

  pool.on('error', (err) => {
    log.error('Postgres pool error', { error: err.message });
  });

  return pool;
}

export function createLazyPool(factory = createDbPool) {
  let pool = null;
  const getPool = () => {
    if (!pool) pool = factory();
    return pool;
  };

  return {
    query: (...args) => getPool().query(...args),
    connect: (...args) => getPool().connect(...args),
    on: (...args) => getPool().on(...args),
    end: async (...args) => {
      const current = pool;
      pool = null;
      if (!current || current.ended) return undefined;
      return current.end(...args);
    },
    get ended() {
      return pool?.ended ?? false;
    },
  };
}

const pool = process.env.NODE_ENV === 'test'
  ? createLazyPool()
  : createDbPool(process.env.DATABASE_URL || 'postgresql://homebase:homebase@127.0.0.1:5433/homebase');

export default pool;
