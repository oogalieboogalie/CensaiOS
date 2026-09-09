import express from 'express';
import { requireDb } from './shared.js';
import {
  getMilestones,
  addMilestone,
  completeMilestone,
} from '../../memory.js';

export const milestonesRouter = express.Router();

/**
 * @route GET /api/milestones/:groupName
 * @returns {Array<object>} Milestones for a canvas group.
 */
milestonesRouter.get('/milestones/:groupName', requireDb, async (req, res) => {
  try {
    res.json(await getMilestones(req.params.groupName));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route POST /api/milestones
 * @param {{groupName:string,title:string,description?:string}} req.body
 * @returns {object} Created milestone.
 */
milestonesRouter.post('/milestones', requireDb, async (req, res) => {
  try {
    const { groupName, title, description } = req.body;
    if (!groupName || !title) return res.status(400).json({ error: 'groupName and title required' });
    res.json(await addMilestone(groupName, title, description));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route PATCH /api/milestones/:id/complete
 * @returns {{ok:boolean}} Completion acknowledgement.
 */
milestonesRouter.patch('/milestones/:id/complete', requireDb, async (req, res) => {
  try {
    await completeMilestone(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
