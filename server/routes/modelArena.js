// POST /api/model-arena/run — one prompt to up to four models at once. The
// reply is NDJSON: start, delta, done or error events tagged with the lane
// (column) they belong to, then one end event when every lane has finished.
import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { parseArenaRequest, runLane } from '../modelArena/runLane.js';
import { userRole } from '../security/systemAdmin.js';

export const modelArenaRouter = express.Router();

async function roleOf(userId) {
  if (!dbReady()) return 'user';
  try {
    return (await userRole(userId, { db: pool })) || 'user';
  } catch {
    return 'user';
  }
}

modelArenaRouter.post('/run', async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const request = parseArenaRequest(req.body);
  if (request.error) return res.status(400).json({ error: request.error });

  const account = { userId, role: await roleOf(userId) };
  let closed = false;
  res.on?.('close', () => { if (!res.writableEnded) closed = true; });
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  const emit = (event) => {
    if (closed) return;
    res.write(JSON.stringify(event) + '\n');
    if (typeof res.flush === 'function') res.flush();
  };

  emit({ type: 'begin', lanes: request.lanes.length });
  await Promise.all(request.lanes.map((spec, lane) => runLane({ lane, spec, request, account, emit })));
  emit({ type: 'end' });
  return res.end();
});
