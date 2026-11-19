// Agent library import, database side: puts a plan from agentLibrary.js on
// the core agents' teams in one workspace, through the same createSubAgent
// the Group window uses. Every row carries
//   tool_scopes.import = { source, key, file, row }
// so a second run skips what is already there (even a helper the owner
// removed) and --undo can take the whole import back out.

import { avoidNameClashes } from './agentLibrary.js';
import { scopedSubAgentId } from '../memory/subagentTenancy.js';

// Imported helpers start read-only: web search and reading, no file edits,
// no PRs. The owner can widen a helper's tools on the board.
export const IMPORT_PERMISSION = 'researcher';

async function readBoard(db, workspaceId, source) {
  const [agents, subs] = await Promise.all([
    db.query('SELECT id, name, hue FROM agents'),
    db.query(
      `SELECT id, name, parent_id, active, tool_scopes->'import'->>'source' AS import_source,
              tool_scopes->'import'->>'key' AS import_key
         FROM sub_agents WHERE workspace_id = $1`,
      [workspaceId],
    ),
  ]);
  const mine = subs.rows.filter(r => r.import_source === source);
  const others = subs.rows.filter(r => r.import_source !== source);
  return { agents: agents.rows, mine, others };
}

/**
 * @param {object} plan  from buildLibraryPlan
 * @param {{db:{query:Function}, createSubAgent:Function}} deps
 * @param {{workspaceId:string, userId:number, source:string, dryRun?:boolean}} opts
 */
export async function importLibraryPlan(plan, deps, { workspaceId, userId, source, dryRun = false }) {
  if (!workspaceId || !Number.isInteger(userId) || userId <= 0 || !source) throw new Error('workspaceId, userId and source are required');
  const { db, createSubAgent } = deps;
  const board = await readBoard(db, workspaceId, source);
  const coreById = new Map(board.agents.map(a => [a.id, a]));
  const missingParents = [...new Set(plan.agents.map(a => a.parentId))].filter(id => !coreById.has(id));
  if (missingParents.length) throw new Error(`No core agent with id: ${missingParents.join(', ')}`);

  const doneKeys = new Set(board.mine.map(r => r.import_key));
  const taken = [...board.agents.map(a => a.name), ...board.others.map(r => r.name)];
  const takenIds = new Set(board.others.map(r => r.id));
  const settled = avoidNameClashes(plan.agents, taken);

  const created = [];
  const alreadyThere = [];
  const refused = [];
  for (const agent of settled) {
    const key = agent.renamedFrom || agent.name;
    if (doneKeys.has(key)) { alreadyThere.push(agent); continue; }
    const id = scopedSubAgentId(agent.name, agent.parentId, workspaceId);
    if (takenIds.has(id)) { refused.push({ ...agent, why: 'a helper this import did not make already uses that id' }); continue; }
    if (dryRun) { created.push({ ...agent, id }); continue; }
    const row = await createSubAgent(agent.parentId, {
      name: agent.name,
      role: agent.role,
      specialty: agent.specialty,
      systemPrompt: agent.systemPrompt,
      hue: coreById.get(agent.parentId)?.hue ?? 0,
      permission: IMPORT_PERMISSION,
      toolScopes: { import: { source, key, file: agent.source?.file || null, row: agent.source?.row ?? null } },
    }, { workspaceId, userId });
    created.push({ ...agent, id: row?.id || id });
  }
  return { created, alreadyThere, refused };
}

/** Remove every helper this import made in the workspace (hard delete). */
export async function undoLibraryImport(db, { workspaceId, source }) {
  if (!workspaceId || !source) throw new Error('workspaceId and source are required');
  const { rows } = await db.query(
    `DELETE FROM sub_agents
      WHERE workspace_id = $1 AND tool_scopes->'import'->>'source' = $2
      RETURNING id, name, parent_id`,
    [workspaceId, source],
  );
  return rows;
}
