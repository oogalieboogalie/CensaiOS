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

export function buildScheduledTaskPrompt(schedule) {
  const projectReference = getScheduleProjectReference(schedule);
  return [
    schedule.task_text,
    '',
    schedule.project_name ? `Project: ${schedule.project_name}` : null,
    projectReference ? `Project tool reference: ${projectReference}` : null,
    schedule.project_repo ? `Project repo: ${schedule.project_repo}` : null,
    schedule.project_path ? `Project path: ${schedule.project_path}` : null,
    schedule.document_target ? `Document target: ${schedule.document_target}` : null,
    projectReference ? `When you use project tools, pass project: "${projectReference}".` : null,
  ].filter(Boolean).join('\n');
}
