function inferTaskTags(goal) {
  const text = String(goal || '').toLowerCase();
  const tags = [];
  if (/\b(ui|ux|frontend|react|component|window|canvas|css|style)\b/.test(text)) tags.push('frontend');
  if (/\b(api|server|route|backend|database|db|postgres|worker)\b/.test(text)) tags.push('backend');
  if (/\b(test|lint|build|ci|verify)\b/.test(text)) tags.push('verification');
  if (/\b(doc|docs|handoff|spec|readme)\b/.test(text)) tags.push('docs');
  return tags;
}

function pickAssignee(subAgents, tags, index) {
  if (!Array.isArray(subAgents) || subAgents.length === 0) return null;
  const scored = subAgents.map((agent, agentIndex) => {
    const haystack = `${agent.name || ''} ${agent.role || ''} ${agent.description || ''}`.toLowerCase();
    const score = tags.reduce((sum, tag) => sum + (haystack.includes(tag) ? 1 : 0), 0);
    return { agent, score, agentIndex };
  });
  scored.sort((a, b) => b.score - a.score || a.agentIndex - b.agentIndex);
  return scored[0].score > 0 ? scored[0].agent : subAgents[index % subAgents.length];
}

export function buildPlannedTask(goal, subAgents = [], index = 0) {
  const cleanGoal = String(goal || '').trim();
  const title = cleanGoal.length > 72 ? `${cleanGoal.slice(0, 69)}...` : cleanGoal;
  const tags = inferTaskTags(cleanGoal);
  const assignee = pickAssignee(subAgents, tags, index);
  return {
    id: `planned-${index + 1}`,
    title: title || `Planned task ${index + 1}`,
    goal: cleanGoal,
    prompt: cleanGoal,
    priority: tags.includes('verification') ? 'high' : 'normal',
    tags,
    mode: 'parallel-ok',
    risk: 'low',
    assigneeId: assignee?.id || null,
    assigneeName: assignee?.name || null,
  };
}

export function markPlanConflicts(tasks = []) {
  if (!Array.isArray(tasks)) return [];
  const seenTags = new Map();
  return tasks.map((task) => {
    const tags = Array.isArray(task.tags) ? task.tags : [];
    const sharedTag = tags.find(tag => seenTags.has(tag) && tag !== 'docs');
    tags.forEach(tag => seenTags.set(tag, true));
    if (!sharedTag) return task;
    return {
      ...task,
      mode: 'sequence-review',
      risk: sharedTag === 'verification' ? 'shared-file' : 'conflict',
      conflictReason: `Overlaps with another ${sharedTag} task`,
    };
  });
}
