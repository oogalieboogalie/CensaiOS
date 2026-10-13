import { resolveProjectForCall } from '../helpers.js';
import { scoutFind, scoutMapFor } from '../../repoScout/service.js';
import { formatFileLinks, formatFind, formatMapOverview } from '../../repoScout/format.js';

// scout_map and scout_find: a core agent's scout (read-only; it only points).
export async function handleScoutTool(agentId, name, args = {}, context = {}) {
  try {
    const { project } = await resolveProjectForCall(agentId, args.project, context);
    if (name === 'scout_map') {
      const map = await scoutMapFor(project);
      return args.path ? formatFileLinks(project, map, args.path) : formatMapOverview(project, map);
    }
    if (name !== 'scout_find') throw new Error(`Unknown scout tool: ${name}`);
    const change = String(args.change || '').trim().slice(0, 600);
    if (!change) return 'Error: say what should change, in plain words.';
    const result = await scoutFind({
      project, request: change, userId: context.userId, workspaceId: context.workspaceId, agentId,
    });
    return formatFind(project, result);
  } catch (error) {
    if (error.statusCode) return `Error: ${error.message}`;
    throw error;
  }
}
