import pool from '../db.js';

export async function assertSystemAdmin(req, { db = pool } = {}) {
  const userId = Number(req?.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw Object.assign(new Error('Authentication is required.'), { statusCode: 401 });
  }
  const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
  if (rows[0]?.role !== 'admin') {
    throw Object.assign(new Error('System administrator access is required.'), { statusCode: 403 });
  }
  return { userId, role: 'admin' };
}

export async function requireSystemAdmin(req, res, next) {
  try {
    await assertSystemAdmin(req);
    next();
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      error: status === 500 ? 'System administrator verification is temporarily unavailable.' : error.message,
    });
  }
}
