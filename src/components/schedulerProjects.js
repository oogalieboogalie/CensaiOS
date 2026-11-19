import { readableProjectName, tidyProjectList } from '../../shared/projects/projectList.js';

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

// Each folder or GitHub repo once, no agent worktrees or temp folders, the
// board's default project first and then the most recently used
// (shared/projects/projectList.js).
export function buildSchedulerProjectOptions(projects = [], currentProject = null) {
  const tidy = tidyProjectList(projects, currentProject);
  const options = [];
  const seen = new Set();
  for (const project of tidy) {
    const option = normalizeProjectOption(project);
    if (!option || seen.has(option.value)) continue;
    seen.add(option.value);
    // The menu adds the folder or repo after the name, so the plain name is enough.
    options.push({ ...option, name: readableProjectName(project) });
  }

  // The default project goes first even when the list does not have it yet.
  const currentOption = normalizeProjectOption(currentProject);
  if (currentOption && !tidy.some(p => p.isCurrent) && !seen.has(currentOption.value)) {
    options.unshift({ ...currentOption, name: readableProjectName(currentProject) });
  }
  return options;
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
