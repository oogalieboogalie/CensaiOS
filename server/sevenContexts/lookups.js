// server/sevenContexts/lookups.js
//
// The seven lookups from Alex's drawing 07. Each one searches one place for
// the keywords and returns the few rows that match, already clipped. A lookup
// that finds nothing returns nothing, so it adds nothing to the agent's
// instructions. Every query is scoped to this board (and this person where the
// rows are personal), the same way the rest of the agent's context is.

import { listWorkspaceAgentProjects } from '../workspaces/projectMemberships.js';
import { matchCount, mentions } from './keywords.js';

const MAX_ITEMS = 3;
const clip = (text, max = 160) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};
const rowsOf = async (db, sql, params) => (await db.query(sql, params))?.rows || [];

// Context 0: Researches Topics & Logs Nuggets.
async function nuggets({ db, workspaceId, patterns }) {
  if (!workspaceId) return null;
  const rows = await rowsOf(db,
    `SELECT nugget_title, nugget_content FROM knowledge_nuggets
      WHERE workspace_id = $1 AND (nugget_title ~* ANY($2) OR nugget_content ~* ANY($2))
      ORDER BY quality_score DESC NULLS LAST LIMIT ${MAX_ITEMS}`,
    [workspaceId, patterns]);
  return rows.map((r) => ({ text: clip(`${r.nugget_title}: ${r.nugget_content}`), prompt: true }));
}

// Context 1: Stores Conversation Context. The run's memory step already found
// these (related earlier conversations and remembered facts) and put them in
// the instructions, so they are reported here and never added a second time.
async function conversation({ memory, keywords }) {
  const episodes = (memory?.episodes || []).map((ep) => ({ text: clip(ep.summary), prompt: false }));
  const facts = (memory?.facts || [])
    .filter((f) => mentions(`${f.subject} ${f.attribute} ${f.value}`, keywords))
    .map((f) => ({ text: clip(`${f.subject} ${f.attribute}: ${f.value}`), prompt: false }));
  return [...episodes, ...facts].slice(0, MAX_ITEMS + 2);
}

// Context 2: Logs Lessons Learned (the agent's own memories, and the
// "didn't work" notes on this board's skill sets).
async function lessons({ db, workspaceId, agentId, patterns }) {
  if (!workspaceId) return null;
  const [memories, didnt] = await Promise.all([
    rowsOf(db,
      `SELECT content FROM memories
        WHERE agent_id = $1 AND workspace_id = $2 AND content ~* ANY($3)
        ORDER BY importance DESC NULLS LAST, created_at DESC LIMIT ${MAX_ITEMS}`,
      [agentId, workspaceId, patterns]).catch(() => []),
    skillLog(db, workspaceId, 'didnt', patterns, 2).catch(() => []),
  ]);
  return [
    ...memories.map((r) => ({ text: clip(r.content), prompt: true })),
    ...didnt.map((r) => ({ text: clip(`Didn't work (${r.skill_set_id}): ${r.note}`), prompt: true })),
  ];
}

// Context 3: Knows Tools. The tools themselves are already handed to the
// model; this names the few whose name or description fit the ask best. With
// two or more keywords a tool must match at least two, so a common word like
// "create" alone does not pull in every create_* tool.
async function tools({ tools: list, keywords }) {
  const need = Math.min(2, keywords.length);
  const fits = (list || [])
    .map((t) => t?.function)
    .filter((fn) => fn?.name)
    .map((fn) => ({ name: fn.name, score: matchCount(`${fn.name} ${fn.description || ''}`, keywords) }))
    .filter((t) => t.score >= need)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ITEMS)
    .map((t) => t.name);
  return { items: fits.map((name) => ({ text: name, prompt: true })), checked: (list || []).length };
}

// Context 4: Knows Project Directory (projects this agent is allowed into on
// this board, and the project this chat window is tied to).
async function projects({ db, workspaceId, agentId, keywords, currentProject }) {
  const rows = workspaceId ? await listWorkspaceAgentProjects(db, { workspaceId, agentId }) : [];
  const seen = new Set();
  const items = [];
  for (const r of rows) {
    if (seen.has(r.project_id)) continue;
    seen.add(r.project_id);
    if (!mentions(`${r.project_name} ${r.project_summary || ''} ${r.project_repo || ''}`, keywords)) continue;
    items.push({ text: clip(`${r.project_name}${r.project_summary ? `: ${r.project_summary}` : ''}`), key: r.project_name, prompt: true });
  }
  if (currentProject?.path && mentions(`${currentProject.name || ''} ${currentProject.path}`, keywords)) {
    items.push({ text: clip(currentProject.name || currentProject.path), prompt: false });
  }
  return { items: items.slice(0, MAX_ITEMS), checked: seen.size + (currentProject?.path ? 1 : 0) };
}

// Context 5: Knows Agents (the family and this board's own agents).
async function agents({ db, workspaceId, agentId, patterns }) {
  const [family, board] = await Promise.all([
    rowsOf(db,
      `SELECT name, role FROM agents
        WHERE id <> $1 AND (name ~* ANY($2) OR role ~* ANY($2)) LIMIT ${MAX_ITEMS}`,
      [agentId, patterns]).catch(() => []),
    workspaceId ? rowsOf(db,
      `SELECT name, role FROM sub_agents
        WHERE workspace_id = $1 AND active IS NOT FALSE AND id <> $2
          AND (name ~* ANY($3) OR role ~* ANY($3) OR specialty ~* ANY($3)) LIMIT ${MAX_ITEMS}`,
      [workspaceId, agentId, patterns]).catch(() => []) : [],
  ]);
  return [...family, ...board].slice(0, MAX_ITEMS)
    .map((r) => ({ text: clip(`${r.name}${r.role ? ` (${r.role})` : ''}`, 100), key: r.name, prompt: true }));
}

// Context 6: Logs Things That Worked (the "worked" notes on skill sets; each
// can be turned into a workflow or blueprint template).
async function worked({ db, workspaceId, patterns }) {
  if (!workspaceId) return null;
  const rows = await skillLog(db, workspaceId, 'worked', patterns, MAX_ITEMS);
  return rows.map((r) => ({ text: clip(`Worked (${r.skill_set_id}): ${r.note}`), prompt: true }));
}

function skillLog(db, workspaceId, outcome, patterns, limit) {
  return rowsOf(db,
    `SELECT skill_set_id, note FROM workspace_skill_set_log
      WHERE workspace_id = $1 AND outcome = $2 AND note ~* ANY($3)
      ORDER BY created_at DESC LIMIT ${Number(limit) || MAX_ITEMS}`,
    [workspaceId, outcome, patterns]);
}

// Alex's names from the drawing, in the drawing's order.
export const SEVEN_CONTEXTS = Object.freeze([
  { id: 0, name: 'Researches Topics & Logs Nuggets', label: 'Nugget', lookup: nuggets },
  { id: 1, name: 'Stores Conversation Context', label: 'Earlier chat', lookup: conversation },
  { id: 2, name: 'Logs Lessons Learned', label: 'Lesson', lookup: lessons },
  { id: 3, name: 'Knows Tools', label: 'Tools that fit', lookup: tools },
  { id: 4, name: 'Knows Project Directory', label: 'Project', lookup: projects },
  { id: 5, name: 'Knows Agents', label: 'Agent who could help', lookup: agents },
  { id: 6, name: 'Logs Things That Worked', label: 'Worked before', lookup: worked },
]);
