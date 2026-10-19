// skill_set_log: an agent notes what worked or didn't in one of its skill
// sets. browser_go: an agent drives the Browser window equipped to it.
import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { addSkillSetLog, loadEquippedSkillSets } from '../../skillSets/store.js';
import { slugify } from '../../skillSets/normalize.js';
import { equippedBrowserGo } from '../../skillSets/agentBrowser.js';

function scopeOf(context) {
  const workspaceId = String(context?.workspaceId || '').trim();
  if (!workspaceId || !context?.userId) throw new Error('This needs an open board.');
  return { workspaceId, userId: context.userId };
}

export async function handleSkillSetTool(agentId, name, args = {}, context = {}) {
  const scope = scopeOf(context);
  await requireWorkspaceMember(pool, scope);
  if (name === 'skill_set_log') {
    const sets = await loadEquippedSkillSets(pool, scope.workspaceId, agentId);
    const wanted = String(args.skill_set || '').trim().toLowerCase();
    const set = sets.find((s) => s.id === wanted || s.name.toLowerCase() === wanted || s.id === slugify(wanted));
    if (!set) {
      return sets.length
        ? `Error: you carry ${sets.map((s) => `"${s.name}"`).join(', ')}; log against one of those.`
        : 'Error: you carry no skill sets yet. Someone can equip one in the Exo-Skeleton window.';
    }
    const entry = await addSkillSetLog(pool, scope.workspaceId, {
      skillSetId: set.id, outcome: args.outcome, note: args.note, authorKind: 'agent', authorId: agentId,
    });
    return `Noted in ${set.name}: ${entry.outcome === 'worked' ? 'worked' : 'didn\'t work'}: ${entry.note}`;
  }
  if (name === 'browser_go') return equippedBrowserGo({ ...scope, agentId, url: args.url, focus: args.focus });
  return `Error: unknown tool ${name}`;
}
