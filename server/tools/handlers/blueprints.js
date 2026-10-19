// find_blueprints / save_blueprint: an agent reads and adds to the board's
// Blueprints shelf (Alex's diagram 08).
import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { getBlueprint, saveBlueprint, searchBlueprints } from '../../blueprints/store.js';
import { isBlueprintId } from '../../../src/lib/blueprints/blueprintIds.js';

function scopeOf(context) {
  const workspaceId = String(context?.workspaceId || '').trim();
  if (!workspaceId || !context?.userId) throw new Error('This needs an open board.');
  return { workspaceId, userId: context.userId };
}

const describe = (b) => `- ${b.id} "${b.title}" (${b.shelfName} shelf; type: ${b.type || 'none'}; purpose: ${b.purpose || 'none'})${b.body ? `\n  Steps: ${b.body.slice(0, 1500)}` : ''}`;

export async function handleBlueprintTool(agentId, name, args = {}, context = {}) {
  const scope = scopeOf(context);
  if (name === 'find_blueprints') {
    await requireWorkspaceMember(pool, scope);
    const query = String(args.query || '').trim();
    if (isBlueprintId(query)) {
      const one = await getBlueprint(pool, scope.workspaceId, query);
      return one ? describe(one) : `No blueprint with ID ${query} on this board.`;
    }
    const { matches } = await searchBlueprints(pool, scope.workspaceId, query, { limit: 8 });
    if (!matches.length) return query ? `No blueprint on this board matches "${query}".` : 'This board has no blueprints yet.';
    return matches.map(describe).join('\n');
  }
  if (name === 'save_blueprint') {
    await requireWorkspaceMember(pool, { ...scope, roles: ['owner', 'admin', 'member'] });
    const saved = await saveBlueprint(pool, scope.workspaceId, {
      id: args.id || undefined, title: args.title, shelf: args.shelf, type: args.type, purpose: args.purpose, body: args.steps,
    }, { kind: 'agent', id: agentId, userId: scope.userId });
    return `Saved "${saved.title}" on the ${saved.shelfName} shelf with ID ${saved.id}.`;
  }
  return `Error: unknown tool ${name}`;
}
