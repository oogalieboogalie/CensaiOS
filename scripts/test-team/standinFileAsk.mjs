// The stand-in model's file script: when a tester writes a "Made-up file ask"
// (fileAsk below) to a chat agent, it reads that file of a project the agent
// was given with project_read, or shows it in the live preview beside the
// chat with project_window, or reads it from a GitHub repo with
// github_read_file (or that repo's issues with github_list_issues), the way a
// real model asked to would (fetching the tool with get_tool first when the
// chat loads tools on demand), then says what came back. Used to prove a
// teammate's agent cannot read a file only the computer's owner opens, that
// no one's agent puts one on the board, and that a teammate's agent reads
// GitHub only where a board shared the repo.

export const FILE_ASK = 'Made-up file ask';
const ARGS = {
  project_read: ({ project, path }) => ({ project, path }),
  project_window: ({ project, path }) => ({ action: 'show_file', project, path }),
  github_read_file: ({ project, path }) => ({ repo: project, path }),
  github_list_issues: ({ project }) => ({ repo: project }),
};

/** What a tester writes to ask an agent for the file at `path` in `project` (a repo for the GitHub tools) with `tool`. */
export const fileAsk = (project, path, tool = 'project_read') => `${FILE_ASK}: ${JSON.stringify({ project, path, tool })}`;

const textOf = (message) => (typeof message?.content === 'string' ? message.content : '');
const call = (name, args) => ({ toolCalls: [{ id: `standin-${name}-${Date.now()}`, name, arguments: JSON.stringify(args) }] });

function askedFor(text) {
  const asked = text.split(`${FILE_ASK}:`)[1]?.match(/\{.*\}/s)?.[0];
  try {
    return asked ? JSON.parse(asked) : null;
  } catch {
    return null;
  }
}

/** Returns { content } or { toolCalls } for a file ask, or null for anything else. */
export function fileAskReply(messages = [], tools = []) {
  const lastUser = messages.map((m, i) => [m, i]).filter(([m]) => m.role === 'user').pop();
  if (!lastUser || !textOf(lastUser[0]).includes(`${FILE_ASK}:`)) return null;
  const asked = askedFor(textOf(lastUser[0]));
  if (!asked) return { content: 'Made-up file answer: the ask did not say which file.' };
  const tool = Object.hasOwn(ARGS, asked.tool) ? asked.tool : 'project_read';
  const after = messages.slice(lastUser[1] + 1);
  const named = new Map(after.flatMap((m) => (m.tool_calls || []).map((c) => [c.id, c.function?.name])));
  const read = after.filter((m) => m.role === 'tool' && named.get(m.tool_call_id) === tool).pop();
  if (read) return { content: `Made-up file answer: ${textOf(read).slice(0, 300)}` };
  if (tools.some((t) => t?.function?.name === tool)) return call(tool, ARGS[tool](asked));
  const fetched = after.some((m) => m.role === 'tool' && named.get(m.tool_call_id) === 'get_tool');
  if (!fetched && tools.some((t) => t?.function?.name === 'get_tool')) return call('get_tool', { name: tool });
  return { content: 'Made-up file answer: no file tool was offered.' };
}
