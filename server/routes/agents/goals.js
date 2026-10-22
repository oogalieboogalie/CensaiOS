import express from 'express';
import { requireDb } from './shared.js';
import { createLogger } from '../../logger.js';
import { sessionUserId, isRowId, loggedId } from './groupOwner.js';
import {
  getGoals,
  addGoal,
  updateGoalStatus,
} from '../../memory.js';

const log = createLogger('goals');

export const goalsRouter = express.Router();

function failed(res, what, err) {
  log.error(`${what} failed (${err?.code || 'no code'})`);
  return res.status(500).json({ error: 'Goals are unavailable right now.' });
}

/**
 * @route GET /api/goals/:groupName
 * @returns {Array<object>} Your goals for a canvas group.
 */
goalsRouter.get('/goals/:groupName', requireDb, async (req, res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in first.' });
  try {
    res.json(await getGoals(userId, req.params.groupName));
  } catch (err) {
    return failed(res, 'goals read', err);
  }
});

/**
 * @route POST /api/goals
 * @param {{groupName:string,title:string,description?:string}} req.body
 * @returns {object} Created goal, owned by you.
 */
goalsRouter.post('/goals', requireDb, async (req, res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in first.' });
  try {
    const { groupName, title, description } = req.body;
    if (!groupName || !title) return res.status(400).json({ error: 'groupName and title required' });
    res.json(await addGoal(userId, groupName, title, description));
  } catch (err) {
    return failed(res, 'goal add', err);
  }
});

/**
 * @route PATCH /api/goals/:id
 * @param {{status:string}} req.body
 * @returns {{ok:boolean}} Status update acknowledgement; 404 when the goal is not yours.
 */
goalsRouter.patch('/goals/:id', requireDb, async (req, res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in first.' });
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const changed = isRowId(req.params.id) && await updateGoalStatus(userId, req.params.id, status);
    if (!changed) {
      log.warn(`goal change refused: not yours or no such goal (goal ${loggedId(req.params.id)})`);
      return res.status(404).json({ error: 'No such goal.' });
    }
    res.json({ ok: true });
  } catch (err) {
    return failed(res, 'goal change', err);
  }
});
