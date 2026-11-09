// On Windows the MCP client starts servers through the command shell (so `npx`
// and other .cmd launchers work). The shell splits on spaces, so a server path
// such as C:\Users\Jane Doe\server.js broke into two arguments and the server
// never started. Quote any part that the shell would otherwise split or treat
// as an operator.

const NEEDS_QUOTES = /[\s&|<>^()'"]/;

export function quoteForWindowsShell(part) {
  const text = String(part ?? '');
  if (text === '') return '""';
  if (!NEEDS_QUOTES.test(text)) return text;
  if (text.length > 1 && text.startsWith('"') && text.endsWith('"')) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

// Returns [command, args] ready for child_process.spawn.
export function spawnParts(command, args = [], platform = process.platform) {
  if (platform !== 'win32') return [command, args];
  return [quoteForWindowsShell(command), args.map(quoteForWindowsShell)];
}
