// Pure aggregation for the Analytics Board. Input is the workspace's agent
// task list (GET /api/agent-tasks); output is what the board draws.

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function summarizeTasks(tasks, { now = Date.now(), days = 7 } = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const since = now - days * DAY_MS;
  const recent = list.filter(t => new Date(t.created_at).getTime() >= since);

  const byStatus = {};
  for (const t of list) byStatus[t.status] = (byStatus[t.status] || 0) + 1;

  const finished = list.filter(t => t.status === 'completed' || t.status === 'failed');
  const completed = list.filter(t => t.status === 'completed');
  const durations = completed
    .map(t => new Date(t.completed_at).getTime() - new Date(t.started_at || t.created_at).getTime())
    .filter(ms => Number.isFinite(ms) && ms >= 0);

  const perDay = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now - i * DAY_MS);
    perDay.push({ key: dayKey(date), label: date.toLocaleDateString(undefined, { weekday: 'short' }), created: 0, completed: 0 });
  }
  const dayIndex = Object.fromEntries(perDay.map((d, i) => [d.key, i]));
  for (const t of list) {
    const c = dayIndex[dayKey(t.created_at)];
    if (c !== undefined) perDay[c].created += 1;
    if (t.completed_at && t.status === 'completed') {
      const k = dayIndex[dayKey(t.completed_at)];
      if (k !== undefined) perDay[k].completed += 1;
    }
  }

  const agentMap = {};
  for (const t of recent) {
    const id = t.assignee_id || 'unassigned';
    const row = agentMap[id] || (agentMap[id] = { agentId: id, name: t.assignee_name || id, total: 0, completed: 0, failed: 0 });
    row.total += 1;
    if (t.status === 'completed') row.completed += 1;
    if (t.status === 'failed') row.failed += 1;
  }

  return {
    total: list.length,
    recentCount: recent.length,
    byStatus,
    open: (byStatus.queued || 0) + (byStatus.in_progress || 0) + (byStatus.blocked || 0),
    successRate: finished.length ? completed.length / finished.length : null,
    medianDurationMs: median(durations),
    perDay,
    agents: Object.values(agentMap).sort((a, b) => b.total - a.total),
  };
}

export function summarizeCanvas(wins) {
  const counts = {};
  for (const w of Array.isArray(wins) ? wins : []) counts[w.kind || 'unknown'] = (counts[w.kind || 'unknown'] || 0) + 1;
  return Object.entries(counts).map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
}

export function formatDuration(ms) {
  if (ms == null) return '–';
  const min = ms / 60000;
  if (min < 1) return `${Math.round(ms / 1000)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  return h < 48 ? `${h.toFixed(1)}h` : `${Math.round(h / 24)}d`;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
