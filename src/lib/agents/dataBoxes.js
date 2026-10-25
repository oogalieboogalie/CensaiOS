// Sub-agent data boxes (diagram 15): every sub-agent under a main
// agent gets its own numbered box, 001, 002..., that it and its main agent
// can read and write. The box is the sub-agent's scratchpad
// (sub_agent_scratchpad); this file only gives the boxes their numbers and
// sorts out who is asking. Pure: the server and the Group window use it.

/** '001' from 1. */
export function boxLabel(n) {
  return String(Math.max(1, Number(n) || 1)).padStart(3, '0');
}

/**
 * Number each main agent's sub-agents in the order they were made:
 * Map(subAgentId -> '001'). Sub-agents of different main agents count
 * separately.
 */
export function boxNumbers(subAgents = []) {
  const byParent = new Map();
  for (const sub of Array.isArray(subAgents) ? subAgents : []) {
    if (!sub?.id) continue;
    const list = byParent.get(sub.parent_id) || [];
    list.push(sub);
    byParent.set(sub.parent_id, list);
  }
  const numbers = new Map();
  for (const list of byParent.values()) {
    list
      .slice()
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)))
      .forEach((sub, i) => numbers.set(sub.id, boxLabel(i + 1)));
  }
  return numbers;
}

const SELF_WORDS = new Set(['', 'me', 'self', 'mine', 'my box', 'own']);

/**
 * Whose box a scratchpad tool call means. A main agent names one of its
 * sub-agents (by name, id or box number). A sub-agent can only reach its own
 * box: it may leave the name out, say "me", or use its own name, id or number.
 * Returns the matching sub-agent or null.
 */
export function pickBox({ caller = null, children = [], asked = '' } = {}) {
  const want = String(asked ?? '').trim().toLowerCase();
  const numbers = boxNumbers(children);
  const named = children.find((s) => s.name?.toLowerCase() === want || String(s.id).toLowerCase() === want || numbers.get(s.id) === want.padStart(3, '0'));
  if (named && want) return named;
  if (!caller) return null;
  if (SELF_WORDS.has(want) || caller.name?.toLowerCase() === want || String(caller.id).toLowerCase() === want) return caller;
  return null;
}

/** The box as plain lines for a model: "[key]: value". */
export function boxText(entries = []) {
  return (Array.isArray(entries) ? entries : []).map((e) => `[${e.key}]: ${e.value}`).join('\n');
}

/**
 * The box's own door: the GET and POST addresses other tools on the board use
 * to read from it and post to it. They go through the same sign-in and
 * workspace checks as the app, so only someone signed in to this workspace
 * gets through. `origin` is where the app runs (window.location.origin).
 */
export function boxDoor({ subId, project = 'default', workspaceId = '', origin = '' } = {}) {
  if (!subId) return null;
  const path = `/api/scratchpad/${encodeURIComponent(subId)}/${encodeURIComponent(project || 'default')}`;
  const base = `${String(origin || '').replace(/\/+$/, '')}${path}`;
  const read = `${base}?workspaceId=${encodeURIComponent(workspaceId || '')}`;
  const body = JSON.stringify({ workspaceId: workspaceId || '', key: 'note-name', value: 'what to keep' });
  return {
    read,
    readOne: `${read}&key=note-name`,
    post: base,
    body,
    curlPost: `curl -X POST ${base} -H "Content-Type: application/json" -b <your sign-in cookie> -d '${body}'`,
  };
}
