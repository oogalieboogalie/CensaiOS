// server/routes/recents.js
//
// Recents: the signed-in person's latest chats with any agent, newest first,
// on this board or on every board, with when each started and was last
// touched. One chat's full messages (with times) reopen it on the board.
// Read from agent_turns (docker/068); everything is the person's own.

import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import * as turnStore from '../agentMemory/turns.js';

const log = createLogger('recents');
const ID = /^[A-Za-z0-9:._-]{1,200}$/;

export function chatView(row) {
  return {
    id: row.conversation_id,
    agentId: row.agent_id,
    workspaceId: row.workspace_id,
    boardName: row.workspace_name || null,
    windowId: row.window_id,
    origin: row.origin,
    startedAt: row.started_at,
    lastAt: row.last_at,
    messages: row.turns,
    title: String(row.first_text || row.last_text || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    lastLine: String(row.last_text || '').replace(/\s+/g, ' ').trim().slice(0, 160),
  };
}

export function createRecentsRouter({ db = pool, isReady = dbReady } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!isReady()) return res.status(503).json({ error: 'The database is not ready yet.' });
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
    return next();
  });

  router.get('/', async (req, res) => {
    const board = String(req.query.workspaceId || '');
    const scope = req.query.scope === 'all' ? 'all' : 'board';
    try {
      const rows = await turnStore.recentConversations(db, {
        userId: req.session.userId,
        workspaceId: scope === 'board' && ID.test(board) ? board : null,
        limit: Math.min(50, Math.max(1, Number(req.query.limit) || 30)),
      });
      log.info('recents listed', { scope, count: rows.length });
      res.json({ scope, chats: rows.map(chatView) });
    } catch (error) {
      log.warn('recents failed', { code: safeErrorCode(error) });
      res.status(500).json({ error: 'Recents are not available right now.' });
    }
  });

  router.get('/chats/:id', async (req, res) => {
    const id = String(req.params.id || '');
    if (!ID.test(id)) return res.status(404).json({ error: 'No such chat.' });
    try {
      const turns = await turnStore.conversationTurns(db, { userId: req.session.userId, conversationId: id });
      if (!turns.length) return res.status(404).json({ error: 'No such chat.' });
      return res.json({
        id,
        agentId: turns[0].agent_id,
        workspaceId: turns[turns.length - 1].workspace_id,
        windowId: turns[turns.length - 1].window_id,
        turns: turns.map((t) => ({ id: String(t.id), speaker: t.speaker, text: t.text, at: t.at })),
      });
    } catch (error) {
      log.warn('recents chat failed', { code: safeErrorCode(error) });
      return res.status(500).json({ error: 'That chat is not available right now.' });
    }
  });

  return router;
}

export const recentsRouter = createRecentsRouter();
