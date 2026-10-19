export function getScheduleProjectReference(schedule) {
  return String(
    schedule.project_ref
      || schedule.project_id
      || schedule.project_repo
      || schedule.project_path
      || schedule.project_name
      || ''
  ).trim();
}

// A wake-up Censai set (server/wakeUps): for himself, or to wake a family agent.
function wakeUpLines(schedule) {
  const setter = String(schedule.set_by_agent || '').toLowerCase();
  if (!setter) return [schedule.task_text];
  const why = schedule.agent_reason ? `Why: ${schedule.agent_reason}` : null;
  if (setter === String(schedule.agent_id || '').toLowerCase()) {
    return ['You set this wake-up for yourself.', why, `What you planned to do: ${schedule.task_text}`,
      'Do it now. Finish with one or two lines on what you did; that lands in your chat.'];
  }
  return ['Censai woke you up to do your part.', why, `What Censai asks: ${schedule.task_text}`,
    'First check your messages with `read_messages`, then do your part. When you are done, tell Censai what you did with `message_to` (agent: "censai").'];
}

export function buildScheduledTaskPrompt(schedule) {
  const projectReference = getScheduleProjectReference(schedule);
  return [
    ...wakeUpLines(schedule),
    '',
    schedule.project_name ? `Project: ${schedule.project_name}` : null,
    projectReference ? `Project tool reference: ${projectReference}` : null,
    schedule.project_repo ? `Project repo: ${schedule.project_repo}` : null,
    schedule.project_path ? `Project path: ${schedule.project_path}` : null,
    schedule.document_target ? `Document target: ${schedule.document_target}` : null,
    projectReference ? `When you use project tools, pass project: "${projectReference}".` : null,
    'This is a scheduled check. If you find something the person would want to know now, tell them with `speak_up` (one or two short sentences). Otherwise do not use it.',
  ].filter(Boolean).join('\n');
}
