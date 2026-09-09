import express from 'express';
import { requireDb } from './shared.js';
import {
  getGoals,
  addGoal,
  updateGoalStatus,
} from '../../memory.js';

export const goalsRouter = express.Router();

/**
 * @route GET /api/goals/:groupName
 * @returns {Array<object>} Goals for a canvas group.
 */
goalsRouter.get('/goals/:groupName', requireDb, async (req, res) => {
  try {
    res.json(await getGoals(req.params.groupName));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route POST /api/goals
 * @param {{groupName:string,title:string,description?:string}} req.body
 * @returns {object} Created goal.
 */
goalsRouter.post('/goals', requireDb, async (req, res) => {
  try {
    const { groupName, title, description } = req.body;
    if (!groupName || !title) return res.status(400).json({ error: 'groupName and title required' });
    res.json(await addGoal(groupName, title, description));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route PATCH /api/goals/:id
 * @param {{status:string}} req.body
 * @returns {{ok:boolean}} Status update acknowledgement.
 */
goalsRouter.patch('/goals/:id', requireDb, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    await updateGoalStatus(req.params.id, status);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
