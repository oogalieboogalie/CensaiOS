// Censai the orchestrator: a checklist item that says a file must exist is
// checked by looking for it in the project, the way the agent's own
// project_read does (its access to the project, a folder here or on GitHub).

import { clip } from './shape.js';

const read = async (...args) => (await import('../tools/handlers/projects.js')).handleProjectsTool(...args);

function missing(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR' || /GitHub API error 404/.test(error?.message || '');
}

function folder(error) {
  return error?.code === 'EISDIR' || /^Not a file:/.test(error?.message || '');
}

/** { exists: true | false | null, line }. null: the project could not be looked in. */
export async function findProjectFile({ agentId, project, path, context = {}, readFile = read }) {
  if (!project) return { exists: null, line: `I could not look for ${path}: the plan names no project.` };
  try {
    await readFile(agentId, 'project_read', { project, path, max_chars: 200 }, context);
    return { exists: true, line: `Found ${path} in the project.` };
  } catch (error) {
    if (folder(error)) return { exists: true, line: `Found the folder ${path} in the project.` };
    if (missing(error)) return { exists: false, line: `${path} is not in the project.` };
    return { exists: null, line: `I could not look for ${path}: ${clip(error?.message || 'the project did not answer', 160)}` };
  }
}
