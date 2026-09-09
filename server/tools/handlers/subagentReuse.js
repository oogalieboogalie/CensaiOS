function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

export function findReusableSubAgents(existing, request) {
  const name = normalized(request.name);
  const agentClass = normalized(request.class);
  const permission = normalized(request.permission);
  const projectId = normalized(request.projectId);
  const specialtyWords = new Set(normalized(request.specialty).split(/[^a-z0-9]+/).filter(Boolean));

  return existing
    .map(sub => {
      let score = 0;
      if (normalized(sub.name) === name) score += 100;
      if (agentClass && normalized(sub.class) === agentClass) score += 20;
      if (permission && normalized(sub.permission) === permission) score += 8;
      if (projectId && normalized(sub.project_id) === projectId) score += 8;
      const haystack = normalized(`${sub.name} ${sub.role} ${sub.specialty}`);
      for (const word of specialtyWords) {
        if (word.length >= 4 && haystack.includes(word)) score += 3;
      }
      return { sub, score };
    })
    .filter(match => match.score >= 20)
    .sort((a, b) => b.score - a.score);
}

export function formatReuseNotice(matches) {
  const options = matches.slice(0, 5).map(({ sub }) => {
    const detail = sub.specialty || sub.role || sub.class || sub.permission;
    return `- ${sub.name} (${sub.id}): ${detail}`;
  });
  return [
    'Creation stopped because active sub-agents already match this role.',
    ...options,
    'Reuse one of them with submit_agent_task or dispatch_squad.',
    'Only call create_sub_agent again with force_new=true when a genuinely separate persistent role is required.',
  ].join('\n');
}
