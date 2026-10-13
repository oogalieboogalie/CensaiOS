export function scoreHandoffSubAgent(sub, currentProject, cleanText) {
  const haystack = [
    sub.id,
    sub.name,
    sub.role,
    sub.specialty,
    sub.class,
    JSON.stringify(sub.tool_scopes || {}),
  ].filter(Boolean).join(' ').toLowerCase();
  let score = 0;

  if (sub.project_id && currentProject?.name && sub.project_id === currentProject.name) score += 25;
  if (sub.project_id && currentProject?.id && sub.project_id === currentProject.id) score += 25;
  if (sub.project_id && /homebase|censaihub/i.test(`${currentProject?.name || ''} ${currentProject?.path || ''}`) && /homebase|censaihub/i.test(sub.project_id)) score += 15;

  if (haystack.includes('jules-submitter') || haystack.includes('jules submitter')) score += 70;
  if (haystack.includes('jules')) score += 25;
  if (haystack.includes('builder') || haystack.includes('coder')) score += 30;
  if (haystack.includes('implementation') || haystack.includes('feature developer')) score += 10;

  if (/\b(review|audit|inspect|check)\b/i.test(cleanText) && haystack.includes('reviewer')) score += 25;
  if (/\b(research|map|find|summarize|brief)\b/i.test(cleanText) && haystack.includes('researcher')) score += 20;

  if (/\b(test|smoke|probe|pipeline|branch-tester)\b/.test(haystack)) score -= 100;
  if (!sub.system_prompt && !sub.system_prompt_inject) score -= 20;
  if (String(sub.permission || '').toLowerCase() !== 'worker') score -= 25;

  return score;
}

export function chooseHandoffSubAgent(subs, currentProject, cleanText) {
  return subs
    .filter(sub => String(sub.permission || '').toLowerCase() === 'worker')
    .map(sub => ({ sub, score: scoreHandoffSubAgent(sub, currentProject, cleanText) }))
    .sort((a, b) => b.score - a.score || String(a.sub.created_at).localeCompare(String(b.sub.created_at)))[0]?.sub
    || subs[0];
}
