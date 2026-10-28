// The stand-in model's terminal script: when a tester writes "Made-up
// terminal ask" to a chat agent, it tries to run a command in the terminal
// with terminal_run, the way a real model told to "run echo" would (fetching
// the tool with get_tool first when the chat loads tools on demand), then
// says what came back. Used to prove a teammate's agent cannot reach the
// owner's terminal.

export const TERMINAL_ASK = 'Made-up terminal ask';
export const TERMINAL_COMMAND = 'echo made-up-$((150+3))';

const textOf = (message) => (typeof message?.content === 'string' ? message.content : '');
const call = (name, args) => ({ toolCalls: [{ id: `standin-${name}-${Date.now()}`, name, arguments: JSON.stringify(args) }] });

/** Returns { content } or { toolCalls } for a terminal ask, or null for anything else. */
export function terminalAskReply(messages = [], tools = []) {
  const lastUser = messages.map((m, i) => [m, i]).filter(([m]) => m.role === 'user').pop();
  if (!lastUser || !textOf(lastUser[0]).includes(TERMINAL_ASK)) return null;
  const after = messages.slice(lastUser[1] + 1);
  const named = new Map(after.flatMap((m) => (m.tool_calls || []).map((c) => [c.id, c.function?.name])));
  const ran = after.filter((m) => m.role === 'tool' && named.get(m.tool_call_id) === 'terminal_run').pop();
  if (ran) return { content: `Made-up terminal answer: ${textOf(ran).slice(0, 200)}` };
  if (tools.some((t) => t?.function?.name === 'terminal_run')) return call('terminal_run', { command: TERMINAL_COMMAND });
  const asked = after.some((m) => m.role === 'tool' && named.get(m.tool_call_id) === 'get_tool');
  if (!asked && tools.some((t) => t?.function?.name === 'get_tool')) return call('get_tool', { name: 'terminal_run' });
  return { content: 'Made-up terminal answer: no terminal tool was offered.' };
}
