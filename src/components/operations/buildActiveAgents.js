import { getAgentById } from '../../lib/agentStore.js';

function normalizeSchedule(schedule = {}, subAgents = []) {
  const agentId = schedule.agentId || schedule.agent_id || schedule.assignee_id || null;
  const subAgent = subAgents.find(agent => agent.id === agentId);
  return {
    ...schedule, agentId,
    agentName: schedule.agentName || schedule.agent_name || subAgent?.name || agentId,
    projectName: schedule.projectName || schedule.project_name || schedule.project || schedule.project_id || null,
    taskText: schedule.taskText || schedule.task_text || schedule.title || '',
    date: schedule.date || schedule.scheduled_date || null,
    time: schedule.time || schedule.scheduled_time || null,
    nextRunAt: schedule.nextRunAt || schedule.next_run_at || null,
    lastRunAt: schedule.lastRunAt || schedule.last_run_at || null,
    lastError: schedule.lastError || schedule.last_error || null,
    status: schedule.status || 'active',
  };
}

export function buildActiveAgents({ tasks, schedules, jules, subAgents }) {
  const byId = new Map();
  const add = ({ id, name, detail, kind, tone, hue }) => {
    if (!id) return;
    const existing = byId.get(id);
    const next = { id, name: name || id, detail, kind, tone, hue, initial: (name || id || '?').slice(0, 1).toUpperCase() };
    byId.set(id, existing
      ? { ...existing, detail: `${existing.detail}; ${detail}`, kind: existing.kind === kind ? kind : 'mixed', tone: existing.tone === 'live' ? 'live' : tone }
      : next);
  };

  for (const task of tasks) {
    const sub = subAgents.find(agent => agent.id === task.assignee_id);
    add({ id: task.assignee_id, name: sub?.name || task.assignee_id, detail: task.title || 'Delegated task', kind: task.status === 'in_progress' ? 'task' : 'queued', tone: task.status === 'in_progress' ? 'live' : 'warn', hue: sub?.hue });
  }

  for (const rawSchedule of schedules) {
    const schedule = normalizeSchedule(rawSchedule, subAgents);
    const agent = getAgentById(schedule.agentId);
    add({ id: schedule.agentId, name: schedule.agentName || agent?.name || schedule.agentId, detail: schedule.taskText || 'Scheduled task', kind: schedule.status === 'running' ? 'schedule' : 'scheduled', tone: schedule.status === 'running' ? 'live' : 'quiet', hue: agent?.hue || rawSchedule.hue });
  }

  if (jules.length > 0) {
    add({ id: 'jules', name: 'Jules', detail: `${jules.length} active session${jules.length === 1 ? '' : 's'}`, kind: 'jules', tone: 'live', hue: 285 });
  }

  return [...byId.values()].sort((a, b) =>
    (a.tone === 'live' ? -1 : 1) - (b.tone === 'live' ? -1 : 1) || a.name.localeCompare(b.name)
  );
}
