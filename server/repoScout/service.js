// The scout for one core agent, one person and one project: find the
// project's folder, keep its map fresh, and run the scout's model on the
// person's own key. Used by the agent tools and by the Scout panel.

import { mapProjectPathForRuntime } from '../workspaces/shared.js';
import { getRepoMap } from './map.js';
import { findWhereToChange } from './find.js';
import { resolveScoutModel } from './settings.js';
import { scoutCompleter } from './scoutModel.js';

export function projectFolder(project) {
  if (!project?.path) {
    const where = project?.repo ? `It lives on GitHub (${project.repo})` : 'It has no folder';
    throw Object.assign(new Error(`${where}; the scout maps projects in a folder on this computer for now.`), { statusCode: 422 });
  }
  return mapProjectPathForRuntime(project.path);
}

export async function scoutMapFor(project, { force = false } = {}) {
  return getRepoMap(projectFolder(project), { force });
}

export async function scoutFind({ project, request, userId, workspaceId, agentId }, deps = {}) {
  const map = await (deps.getMap || scoutMapFor)(project);
  const choice = await (deps.resolveModel || resolveScoutModel)({ userId, agentId });
  let complete = null;
  if (choice.provider) {
    complete = deps.makeCompleter
      ? await deps.makeCompleter(choice)
      : await scoutCompleter({ userId, workspaceId, provider: choice.provider, model: choice.model }).catch(() => null);
  }
  const result = await findWhereToChange(map, request, { complete, modelLabel: choice.label || null });
  return { ...result, scoutModel: choice };
}
