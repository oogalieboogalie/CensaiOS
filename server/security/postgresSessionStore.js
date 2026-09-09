import session from 'express-session';

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function sessionExpiry(sess, now = Date.now()) {
  const explicit = sess?.cookie?.expires ? new Date(sess.cookie.expires) : null;
  return explicit && Number.isFinite(explicit.getTime())
    ? explicit
    : new Date(now + DEFAULT_MAX_AGE_MS);
}

export class PostgresSessionStore extends session.Store {
  constructor(dbPool, {
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    cleanupOnStart = true,
    onCleanupError = (error) => console.warn('[session] cleanup failed:', error.message),
  } = {}) {
    super();
    this.pool = dbPool;
    this.onCleanupError = onCleanupError;
    this.cleanupTimer = null;
    if (cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpired().catch(this.onCleanupError);
      }, cleanupIntervalMs);
      this.cleanupTimer.unref?.();
    }
    if (cleanupOnStart) this.cleanupExpired().catch(this.onCleanupError);
  }

  async cleanupExpired() {
    const result = await this.pool.query('DELETE FROM session WHERE expire <= NOW()');
    return result.rowCount || 0;
  }

  get(sid, callback) {
    this.pool.query(
      'SELECT sess FROM session WHERE sid = $1 AND expire > NOW()',
      [sid]
    ).then((result) => callback(null, result.rows[0]?.sess || null), callback);
  }

  set(sid, sess, callback = () => {}) {
    this.pool.query(
      `INSERT INTO session (sid, sess, expire) VALUES ($1, $2, $3)
       ON CONFLICT (sid) DO UPDATE SET sess = $2, expire = $3`,
      [sid, JSON.stringify(sess), sessionExpiry(sess)]
    ).then(() => callback(null), callback);
  }

  touch(sid, sess, callback = () => {}) {
    this.pool.query(
      'UPDATE session SET expire = $2 WHERE sid = $1 AND expire > NOW()',
      [sid, sessionExpiry(sess)]
    ).then(() => callback(null), callback);
  }

  destroy(sid, callback = () => {}) {
    this.pool.query('DELETE FROM session WHERE sid = $1', [sid])
      .then(() => callback(null), callback);
  }

  close() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }
}
