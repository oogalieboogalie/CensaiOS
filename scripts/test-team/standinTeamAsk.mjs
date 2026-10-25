// The stand-in model's one scripted behaviour: when a tester writes
// "Made-up team ask" to a chat agent, it uses the agent network tools the
// way a real model would. It finds a helper with discover_agents (or goes
// straight to "ask window:<id>" when the message names one), asks it with
// request_agent_help, and then reports what came back. Every other message
// gets the plain stand-in answer. Chat agents load tools on demand, so it
// first fetches each tool with get_tool, as a real model does.

export const TEAM_ASK = 'Made-up team ask';
export const TEAM_TASK = 'Made-up request: name one database a made-up bakery could use for its orders.';

const textOf = (message) => (typeof message?.content === 'string' ? message.content : '');
const parse = (text) => { try { return JSON.parse(text); } catch { return {}; } };
const call = (name, args) => ({ toolCalls: [{ id: `standin-${name}-${Date.now()}`, name, arguments: JSON.stringify(args) }] });

/** The next step of the ask, from what the network tools have answered so far. */
function nextStep(text, results) {
  const last = results[results.length - 1];
  const direct = text.match(/ask (window:[\w.:-]+)/)?.[1];
  if (!last) {
    return direct
      ? { tool: 'request_agent_help', args: { card_id: direct, task: TEAM_TASK, wait_seconds: 30 } }
      : { tool: 'discover_agents', args: { query: 'databases' } };
  }
  if (last.name === 'discover_agents') {
    const helper = (last.body.board_helpers || [])[0];
    if (!helper?.card_id) return { content: 'Made-up team answer: nobody on this board can help with that.' };
    return { tool: 'request_agent_help', args: { card_id: helper.card_id, task: TEAM_TASK, wait_seconds: 30 } };
  }
  if (last.body.status === 'completed') return { content: `Made-up team answer from ${last.body.agent}: ${last.body.result}` };
  return { content: `Made-up team answer: the ask did not go through (${last.body.error || last.body.status || 'no reason given'}).` };
}

/** Returns { content } or { toolCalls } for a team ask, or null for anything else. */
export function teamAskReply(messages = [], tools = []) {
  const lastUser = messages.map((m, i) => [m, i]).filter(([m]) => m.role === 'user').pop();
  if (!lastUser || !textOf(lastUser[0]).includes(TEAM_ASK)) return null;
  const has = (name) => tools.some((t) => t?.function?.name === name);
  const after = messages.slice(lastUser[1] + 1);
  const named = new Map(after.flatMap((m) => (m.tool_calls || []).map((c) => [c.id, c.function?.name])));
  const results = after.filter((m) => m.role === 'tool')
    .map((m) => ({ name: named.get(m.tool_call_id), body: parse(textOf(m)) }))
    .filter((r) => r.name === 'discover_agents' || r.name === 'request_agent_help');
  const step = nextStep(textOf(lastUser[0]), results);
  if (!step.tool) return step;
  if (has(step.tool)) return call(step.tool, step.args);
  return has('get_tool') ? call('get_tool', { name: step.tool }) : null;
}
