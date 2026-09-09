import express from 'express';
import { randomUUID } from 'crypto';
import { requireDb } from './shared.js';
import {
  getAllSubAgents,
  getSubAgentById,
  getAgentTasks,
  getAgentTask,
  createAgentTask,
  updateAgentTask,
} from '../../memory.js';

import { markPlanConflicts, buildPlannedTask } from '../../memory/tasks.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';


function splitBatchGoals(text = '') {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return [];

  const lines = normalized
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

  if (lines.length > 1) return lines;

  return normalized
    .split(/\b(?:agent\s+[a-z0-9]+|agent\s+\d+|and asking|asking)\b/i)
    .map(part => part.replace(/^to\s+/i, '').trim())
    .filter(part => part.length > 12);
}

export const tasksRouter = express.Router();

tasksRouter.get('/agent-tasks', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const tasks = await getAgentTasks(null, {
      ...scope,
      status: req.query.status || null,
      limit: req.query.limit || 100,
    });
    res.json(tasks);
  } catch (err) {
    agentRouteError(res, err);
  }
});

tasksRouter.get('/agent-tasks/:agentId', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const tasks = await getAgentTasks(req.params.agentId, {
      ...scope,
      status: req.query.status || null,
      limit: req.query.limit || 100,
    });
    res.json(tasks);
  } catch (err) {
    agentRouteError(res, err);
  }
});

tasksRouter.post('/agent-tasks', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { parentId, assigneeId, project, title, prompt, priority } = req.body;
    if (!parentId || !assigneeId || !title || !prompt) {
      return res.status(400).json({ error: 'parentId, assigneeId, title, and prompt required' });
    }

    const assignee = await getSubAgentById(assigneeId, scope);
    if (!assignee) return res.status(404).json({ error: 'Assignee sub-agent not found' });

    const task = await createAgentTask({
      parentId: assignee.parent_id,
      assigneeId,
      projectId: assignee.project_id || null,
      project: project || assignee.project_id || null,
      title,
      prompt,
      priority,
      ...scope,
    });
    res.json(task);
  } catch (err) {
    agentRouteError(res, err);
  }
});

tasksRouter.post('/agent-task-plan', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { text, groupName, subAgentIds } = req.body || {};
    const goals = splitBatchGoals(text);
    if (goals.length === 0) {
      return res.status(400).json({ error: 'Describe at least one work item to plan.' });
    }

    const allSubs = await getAllSubAgents(scope);
    const allowed = Array.isArray(subAgentIds) && subAgentIds.length
      ? new Set(subAgentIds)
      : null;
    const subAgents = allSubs.filter(sub => {
      if (allowed && !allowed.has(sub.id)) return false;
      if (!groupName) return true;
      return true;
    });

    const tasks = markPlanConflicts(goals.map((goal, index) => buildPlannedTask(goal, subAgents, index)));
    const conflicts = tasks.filter(task => task.risk === 'conflict').length;
    const shared = tasks.filter(task => task.risk === 'shared-file').length;

    res.json({
      summary: {
        total: tasks.length,
        parallelSafe: tasks.filter(task => task.mode === 'parallel-ok').length,
        needsSequencing: tasks.length - tasks.filter(task => task.mode === 'parallel-ok').length,
        conflicts,
        shared,
      },
      tasks,
    });
  } catch (err) {
    agentRouteError(res, err);
  }
});

tasksRouter.post('/agent-task-plan/queue', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const { parentId, project, tasks = [], batchLabel } = req.body || {};
    if (!parentId) return res.status(400).json({ error: 'parentId required' });
    if (!Array.isArray(tasks) || tasks.length === 0) return res.status(400).json({ error: 'tasks required' });

    const batchId = randomUUID();
    const created = [];
    const skipped = [];

    for (const planned of tasks) {
      if (!planned.assigneeId) {
        skipped.push({ title: planned.title, reason: 'No assignee selected' });
        continue;
      }
      const assignee = await getSubAgentById(planned.assigneeId, scope);
      if (!assignee) {
        skipped.push({ title: planned.title, reason: 'Assignee sub-agent not found' });
        continue;
      }

      const task = await createAgentTask({
        parentId: assignee.parent_id,
        assigneeId: assignee.id,
        projectId: assignee.project_id || null,
        project: project || assignee.project_id || null,
        title: planned.title,
        prompt: planned.prompt || planned.goal,
        priority: planned.priority || 'normal',
        batchId,
        batchLabel: batchLabel || 'Coordinated work batch',
        ...scope,
      });
      created.push(task);
    }

    res.json({ batchId, created, skipped });
  } catch (err) {
    agentRouteError(res, err);
  }
});

tasksRouter.put('/agent-tasks/:id', requireDb, async (req, res) => {
  try {
    const scope = await resolveAgentRouteScope(req);
    const current = await getAgentTask(req.params.id, scope);
    if (!current) return res.status(404).json({ error: 'Task not found' });

    const task = await updateAgentTask(req.params.id, req.body, scope);
    res.json(task);
  } catch (err) {
    agentRouteError(res, err);
  }
});
