// server/outsideTools/toolNames.js
//
// How an outside tool is named for a model: mcp__<server>__<tool>. Models
// only accept letters, digits, _ and - in tool names, 64 at most, so both
// halves are cleaned and the real tool name is kept beside it for the call.

const PREFIX = 'mcp__';
const MAX_NAME = 64;

export function serverSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16)
    .replace(/_+$/g, '') || 'tools';
}

export function publicToolName(slug, toolName) {
  const head = `${PREFIX}${slug}__`;
  const tool = String(toolName || 'tool').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, MAX_NAME - head.length);
  return `${head}${tool || 'tool'}`;
}

export function isOutsideToolName(name) {
  return typeof name === 'string' && name.startsWith(PREFIX);
}

/** { server, tool } for display, from a public name like mcp__weather__get_forecast. */
export function splitOutsideToolName(name) {
  if (!isOutsideToolName(name)) return null;
  const rest = name.slice(PREFIX.length);
  const cut = rest.indexOf('__');
  if (cut < 0) return { server: rest, tool: '' };
  return { server: rest.slice(0, cut), tool: rest.slice(cut + 2) };
}

/** OpenAI-style tool definitions (what the chat loop speaks) for one server. */
export function toolDefinitions(server) {
  const seen = new Set();
  const out = [];
  for (const tool of server.tools || []) {
    const name = publicToolName(server.slug, tool.name);
    if (seen.has(name)) continue;
    seen.add(name);
    const { $schema, ...schema } = tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : {};
    void $schema;
    out.push({
      name,
      realName: tool.name,
      definition: {
        type: 'function',
        function: {
          name,
          description: `[Outside tool from ${server.name}] ${tool.description || tool.name}`.slice(0, 1024),
          parameters: Object.assign({ type: 'object', properties: {} }, schema, { type: 'object' }),
        },
      },
    });
  }
  return out;
}
