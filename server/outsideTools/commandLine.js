// server/outsideTools/commandLine.js
//
// Turns the command a person types ("npx -y @scope/server --flag 'two words'")
// into a program and its arguments, so the program is started directly and
// never through a shell on Linux or macOS.

export function splitCommandLine(value) {
  const text = String(value || '').trim().slice(0, 2000);
  const parts = [];
  let current = '';
  let quote = null;
  let started = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || current) parts.push(current);
      current = '';
      started = false;
    } else {
      current += ch;
    }
  }
  if (started || current) parts.push(current);
  return parts;
}
