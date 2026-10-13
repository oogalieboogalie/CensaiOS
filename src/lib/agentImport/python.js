// A small reader for agent definitions written in Python (Google ADK agents,
// OpenAI Agents SDK agents). It never runs the code: it finds the Agent(...)
// calls and reads their keyword arguments as text. Strings, lists of names,
// nested calls such as LiteLlm(model="...") and module-level string constants
// are understood; anything else is kept as raw text.

function readString(src, i) {
  // Optional prefix letters (f, r, b, u and pairs) before the quote.
  let j = i;
  while (/[rRbBuUfF]/.test(src[j]) && j - i < 2) j += 1;
  const quote = src[j];
  if (quote !== '"' && quote !== "'") return null;
  const triple = src.slice(j, j + 3) === quote.repeat(3);
  const close = triple ? quote.repeat(3) : quote;
  let k = j + close.length;
  let out = '';
  while (k < src.length) {
    if (src[k] === '\\' && k + 1 < src.length) {
      const next = src[k + 1];
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next === '\n' ? '' : next;
      k += 2;
      continue;
    }
    if (src.startsWith(close, k)) return { value: out, end: k + close.length };
    if (!triple && src[k] === '\n') return null;
    out += src[k];
    k += 1;
  }
  return null;
}

/** Index just past the bracket that closes the one opening at `open`. */
function matchBracket(src, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [pairs[src[open]]];
  let i = open + 1;
  while (i < src.length && stack.length) {
    const ch = src[i];
    if (ch === '#') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const str = readString(src, i);
      i = str ? str.end : i + 1;
      continue;
    }
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === stack[stack.length - 1]) stack.pop();
    i += 1;
  }
  return i;
}

/** Split "a=1, b=[2, 3]" at top-level commas. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '#') {
      while (i < body.length && body[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const str = readString(body, i);
      i = str ? str.end : i + 1;
      continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(body.slice(start));
  return parts.map(p => p.replace(/^\s*#.*$/gm, '').trim()).filter(Boolean);
}

/** Read a run of adjacent string literals ("a" "b" → "ab"). */
function readStringRun(text) {
  let i = 0;
  let out = '';
  let found = false;
  const src = text.trim();
  while (i < src.length) {
    while (/\s/.test(src[i])) i += 1;
    if (src[i] === '(' && !found) {
      // Parenthesised string run.
      const end = matchBracket(src, i);
      return readStringRun(src.slice(i + 1, end - 1));
    }
    const str = readString(src, i);
    if (!str) break;
    out += str.value;
    found = true;
    i = str.end;
  }
  return found && !src.slice(i).trim() ? out : null;
}

/** Module-level NAME = "..." string constants, so instruction=PROMPT resolves. */
export function readStringConstants(src) {
  const constants = {};
  const re = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*str\s*)?=\s*/gm;
  let match;
  while ((match = re.exec(src))) {
    const start = match.index + match[0].length;
    let end = start;
    // Grab to the end of the statement: a string run or a parenthesised run.
    if (src[start] === '(') end = matchBracket(src, start);
    else {
      let i = start;
      while (i < src.length) {
        const str = readString(src, i);
        if (!str) break;
        i = str.end;
        while (src[i] === ' ' || src[i] === '\t') i += 1;
        if (src[i] === '\\' && src[i + 1] === '\n') i += 2;
      }
      end = i;
    }
    const value = readStringRun(src.slice(start, end));
    if (value != null) constants[match[1]] = value;
  }
  return constants;
}

function parseValue(raw, constants) {
  const text = raw.trim();
  const str = readStringRun(text);
  if (str != null) return { kind: 'string', value: str };
  if (constants[text] != null) return { kind: 'string', value: constants[text] };
  if (text.startsWith('[') || text.startsWith('(')) {
    const inner = text.slice(1, matchBracket(text, 0) - 1);
    return { kind: 'list', value: splitTopLevel(inner).map(item => parseValue(item, constants)) };
  }
  const call = /^([A-Za-z_][\w.]*)\s*\(/.exec(text);
  if (call) {
    const open = text.indexOf('(');
    const inner = text.slice(open + 1, matchBracket(text, open) - 1);
    return { kind: 'call', name: call[1], args: parseArgs(inner, constants), raw: text };
  }
  if (/^[A-Za-z_][\w.]*$/.test(text)) return { kind: 'name', value: text };
  return { kind: 'raw', value: text };
}

function parseArgs(body, constants) {
  const args = { positional: [], keywords: {} };
  for (const part of splitTopLevel(body)) {
    const kw = /^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]*)$/.exec(part);
    if (kw) args.keywords[kw[1]] = parseValue(kw[2], constants);
    else args.positional.push(parseValue(part, constants));
  }
  return args;
}

/**
 * Find every call to one of `classNames` (e.g. Agent, LlmAgent) and read its
 * arguments. Returns them in file order with the variable they are assigned to.
 */
export function findPythonCalls(src, classNames) {
  const constants = readStringConstants(src);
  const names = classNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(?:^|\\n)\\s*(?:([A-Za-z_]\\w*)\\s*(?::\\s*[\\w\\[\\]., ]+)?=\\s*)?(?:[\\w.]+\\.)?(${names})\\s*(?:\\[[^\\]]*\\])?\\(`, 'g');
  const out = [];
  let match;
  while ((match = re.exec(src))) {
    const open = match.index + match[0].length - 1;
    const end = matchBracket(src, open);
    out.push({
      variable: match[1] || null,
      className: match[2],
      args: parseArgs(src.slice(open + 1, end - 1), constants),
    });
    re.lastIndex = end;
  }
  return out;
}

/** Plain string for a parsed value, or ''. */
export function valueText(value) {
  if (!value) return '';
  if (value.kind === 'string' || value.kind === 'name' || value.kind === 'raw') return String(value.value);
  if (value.kind === 'call') return value.raw;
  return '';
}

/** Readable names for the items of a tools=[...] list. */
export function listNames(value) {
  if (!value || value.kind !== 'list') return [];
  return value.value.map((item) => {
    if (item.kind === 'name') return item.value.split('.').pop();
    if (item.kind === 'call') {
      // AgentTool(agent=x) → "AgentTool"; MCPToolset(...) → "MCPToolset"
      return item.name.split('.').pop();
    }
    if (item.kind === 'string') return item.value;
    return valueText(item);
  }).filter(Boolean);
}
