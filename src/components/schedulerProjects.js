function normalizeProjectOption(project) {
  if (!project || typeof project !== 'object') return null;

  const id = String(project.id || project.projectId || '').trim();
  const name = String(project.name || '').trim();
  const path = String(project.path || '').trim();
  const repo = String(project.repo || '').trim();
  const projectRef = id || repo || path || name;

  if (!projectRef) return null;

  const caption = repo || path || '';
  return {
    id: id || null,
    name: name || repo || path || 'Unnamed project',
    path: path || null,
    repo: repo || null,
    caption: caption || null,
    value: projectRef,
    projectRef,
  };
}

export function buildSchedulerProjectOptions(projects = [], currentProject = null) {
  const merged = new Map();

  for (const project of projects) {
    const option = normalizeProjectOption(project);
    if (!option) continue;
    merged.set(option.value, option);
  }

  const currentOption = normalizeProjectOption(currentProject);
  if (currentOption && !merged.has(currentOption.value)) {
    merged.set(currentOption.value, currentOption);
  }

  return [...merged.values()].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    return aName.localeCompare(bName);
  });
}

export function getSchedulerProjectReference(projectLike) {
  if (!projectLike || typeof projectLike !== 'object') return '';
  return String(
    projectLike.projectRef
      || projectLike.projectId
      || projectLike.id
      || projectLike.projectRepo
      || projectLike.repo
      || projectLike.projectPath
      || projectLike.path
      || projectLike.projectName
      || projectLike.name
      || ''
  ).trim();
}
