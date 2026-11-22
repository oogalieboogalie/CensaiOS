import {
  readProjectBrief,
  refreshProjectBrief,
  logProjectActivity,
  isGithubProject,
} from '../../workspaces.js';
import { ensureProjectBrief } from '../../workspaces/briefs.js';
import { resolveProjectForCall } from '../helpers.js';
import { noteToolFailure } from '../toolsLog.js';

// The brief parts of the project tools (handlers/projects.js). A project on
// GitHub is only read: its brief is kept in the app (workspaces/briefs.js) and
// built again when the app's copy is gone. Nothing here writes to a repo.

/** What open_project says about the brief, building a GitHub project's missing copy on the way. */
export async function briefNoteOnOpen(agentId, project) {
  if (!isGithubProject(project)) return 'Brief written to .team/PROJECT.md in the folder.';
  try {
    await ensureProjectBrief(project);
  } catch (err) {
    noteToolFailure('project brief not built on open', { agentId }, err);
    return 'The brief could not be built just now; nothing was written to the repo. Try refresh_brief.';
  }
  return 'The brief is kept in the app (read it with read_brief); nothing was written to the repo.';
}

export async function readBriefTool(agentId, args, context) {
  const { project } = await resolveProjectForCall(agentId, args.project, context);
  let brief = await readProjectBrief(project);
  // The app's copy of a GitHub project's brief is gone (and the repo carries none): build it again, reads only.
  if (!brief && isGithubProject(project) && await ensureProjectBrief(project)) brief = await readProjectBrief(project);
  if (!brief) return `No brief for "${project.name}" yet. Use refresh_brief to generate one.`;
  return brief;
}

export async function refreshBriefTool(agentId, args, context) {
  const { project } = await resolveProjectForCall(agentId, args.project, context);
  // Building a GitHub project's brief again only reads the repo.
  await refreshProjectBrief(project);
  await logProjectActivity(project.id, agentId, 'refresh_brief', null);
  return isGithubProject(project)
    ? `Brief refreshed for "${project.name}". It is kept in the app; nothing was written to the repo.`
    : `Brief refreshed for "${project.name}".`;
}
