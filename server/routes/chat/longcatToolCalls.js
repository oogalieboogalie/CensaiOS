const TOOL_CALL_PATTERN = /<longcattoolcall>\s*([a-zA-Z0-9_-]+)([\s\S]*?)<\/longcattoolcall>/gi;
const ARG_PATTERN = /<longcatarg_?key>\s*([\s\S]*?)\s*<\/longcatarg_?key>\s*<longcatarg_?value>([\s\S]*?)<\/longcatarg_?value>/gi;
let fallbackCallId = 0;

function parseArguments(section) {
  const args = {};
  let match;
  let matchedPairs = 0;

  ARG_PATTERN.lastIndex = 0;
  while ((match = ARG_PATTERN.exec(section)) !== null) {
    const key = match[1].trim();
    if (!key) return null;
    args[key] = match[2];
    matchedPairs += 1;
  }

  const keyTags = section.match(/<longcatarg_?key>/gi)?.length || 0;
  const valueTags = section.match(/<longcatarg_?value>/gi)?.length || 0;
  if (keyTags !== matchedPairs || valueTags !== matchedPairs) return null;
  return args;
}

export function parseLongcatToolCalls(content) {
  if (typeof content !== 'string' || !/<longcattoolcall>/i.test(content)) return null;

  const toolCalls = [];
  let match;

  TOOL_CALL_PATTERN.lastIndex = 0;
  while ((match = TOOL_CALL_PATTERN.exec(content)) !== null) {
    const args = parseArguments(match[2]);
    if (!args) continue;

    toolCalls.push({
      id: `call_longcat_${Date.now()}_${++fallbackCallId}`,
      type: 'function',
      function: {
        name: match[1],
        arguments: JSON.stringify(args),
      },
    });
  }

  return toolCalls.length > 0 ? toolCalls : null;
}

export function withLongcatToolCallFallback(message) {
  if (!message || message.tool_calls?.length) return message;

  const toolCalls = parseLongcatToolCalls(message.content);
  return toolCalls ? { ...message, tool_calls: toolCalls } : message;
}
