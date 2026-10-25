import express from 'express';
import { requireDb } from './shared.js';
import { createLogger } from '../../logger.js';
import { sessionUserId, isRowId, loggedId } from './groupOwner.js';
import {
  getMilestones,
  addMilestone,
  completeMilestone,
} from '../../memory.js';

const log = createLogger('milestones');

export const milestonesRouter = express.Router();

function failed(res, what, err) {
  log.error(`${what} failed (${err?.code || 'no code'})`);
  return res.status(500).json({ error: 'Milestones are unavailable right now.' });
}

/**
 * @route GET /api/milestones/:groupName
 * @returns {Array<object>} Your milestones for a canvas group.
 */
milestonesRouter.get('/milestones/:groupName', requireDb, async (req, res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in first.' });
  try {
    res.json(await getMilestones(userId, req.params.groupName));
  } catch (err) {
    return failed(res, 'milestones read', err);
  }
});

/**
 * @route POST /api/milestones
 * @param {{groupName:string,title:string,description?:string}} req.body
 * @returns {object} Created milestone, owned by you.
 */
milestonesRouter.post('/milestones', requireDb, async (req, res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in first.' });
  try {
    const { groupName, title, description } = req.body;
    if (!groupName || !title) return res.status(400).json({ error: 'groupName and title required' });
    res.json(await addMilestone(userId, groupName, title, description));
  } catch (err) {
    return failed(res, 'milestone add', err);
  }
});

/**
 * @route PATCH /api/milestones/:id/complete
 * @returns {{ok:boolean}} Completion acknowledgement; 404 when the milestone is not yours.
 */
milestonesRouter.patch('/milestones/:id/complete', requireDb, async (req, res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in first.' });
  try {
    const changed = isRowId(req.params.id) && await completeMilestone(userId, req.params.id);
    if (!changed) {
      log.warn(`milestone change refused: not yours or no such milestone (milestone ${loggedId(req.params.id)})`);
      return res.status(404).json({ error: 'No such milestone.' });
    }
    res.json({ ok: true });
  } catch (err) {
    return failed(res, 'milestone change', err);
  }
});
