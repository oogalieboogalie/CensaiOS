// Repo scout, step one: read one file without running it and note what it
// defines (functions, classes, routes, tables, with line numbers), what it
// pulls in (import specifiers) and the words it uses. Plain text rules, no
// model and no parser packages, so mapping a whole repo costs nothing.

const JS_EXT = /\.(?:m|c)?(?:j|t)sx?$/i;
const IDENT = '[A-Za-z_$][\\w$]*';

const JS_SYMBOLS = [
  { kind: 'function', re: new RegExp(`^\\s*(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?function\\s*\\*?\\s*(${IDENT})`) },
  { kind: 'class', re: new RegExp(`^\\s*(?:export\\s+(?:default\\s+)?)?(?:abstract\\s+)?class\\s+(${IDENT})`) },
  { kind: 'const', re: new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+(${IDENT})\\s*[=:]`) },
  { kind: 'type', re: new RegExp(`^(?:export\\s+)?(?:interface|type|enum)\\s+(${IDENT})`) },
  { kind: 'method', re: new RegExp(`^\\s{2}(?:static\\s+)?(?:async\\s+)?(${IDENT})\\s*\\([^)]*\\)\\s*\\{\\s*$`) },
];
const ROUTE = /^\s*(?:\w+)\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/;
const PY_SYMBOLS = [
  { kind: 'function', re: /^\s*(?:async\s+)?def\s+(\w+)/ },
  { kind: 'class', re: /^\s*class\s+(\w+)/ },
];
const SQL_SYMBOL = /^\s*create\s+(?:or\s+replace\s+)?(table|view|index|function|trigger)\s+(?:if\s+not\s+exists\s+)?(?:\w+\.)?"?(\w+)/i;
const CSS_SYMBOL = /^\s*\.([A-Za-z_][\w-]*)[^{]*\{/;
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return']);

export function fileLanguage(relPath) {
  const p = relPath.toLowerCase();
  if (JS_EXT.test(p)) return 'js';
  if (p.endsWith('.py')) return 'py';
  if (p.endsWith('.sql')) return 'sql';
  if (/\.(?:css|scss)$/.test(p)) return 'css';
  if (/\.(?:md|mdx)$/.test(p)) return 'md';
  if (/\.(?:json|ya?ml|toml|html|sh|ps1|rs|go)$/.test(p)) return 'text';
  return null;
}

function jsImports(content) {
  const found = new Set();
  const patterns = [
    /(?:^|[\s;])(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|[\s;])import\s*['"]([^'"]+)['"]/g,
    /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const match of content.matchAll(re)) found.add(match[1]);
  }
  return [...found];
}

function pyImports(content) {
  const found = new Set();
  for (const match of content.matchAll(/^\s*from\s+([.\w]+)\s+import\b/gm)) found.add(match[1]);
  for (const match of content.matchAll(/^\s*import\s+([\w.]+)/gm)) found.add(match[1]);
  return [...found];
}

function cssImports(content) {
  return [...content.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function symbolAt(lang, line) {
  if (lang === 'js') {
    const route = ROUTE.exec(line);
    if (route) return { name: `${route[1].toUpperCase()} ${route[2]}`, kind: 'route' };
    for (const { kind, re } of JS_SYMBOLS) {
      const match = re.exec(line);
      if (match && !(kind === 'method' && NOT_METHODS.has(match[1]))) return { name: match[1], kind };
    }
  } else if (lang === 'py') {
    for (const { kind, re } of PY_SYMBOLS) {
      const match = re.exec(line);
      if (match) return { name: match[1], kind };
    }
  } else if (lang === 'sql') {
    const match = SQL_SYMBOL.exec(line);
    if (match) return { name: match[2], kind: match[1].toLowerCase() };
  } else if (lang === 'css') {
    const match = CSS_SYMBOL.exec(line);
    if (match) return { name: match[1], kind: 'style' };
  } else if (lang === 'md') {
    const match = /^#{1,3}\s+(.+)/.exec(line);
    if (match) return { name: match[1].trim().slice(0, 80), kind: 'heading' };
  }
  return null;
}

// Words a person might use for this code: identifiers split on camelCase,
// snake_case and kebab-case, lower-cased, three letters or more.
export function wordsOf(text) {
  return String(text || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && w.length <= 40);
}

function leadingComment(lines) {
  const out = [];
  for (const line of lines.slice(0, 12)) {
    const text = line.trim();
    if (!text) { if (out.length) break; continue; }
    const match = /^(?:\/\/+|#(?!!)|\/?\*+\/?|--)\s?(.*)$/.exec(text);
    if (!match) break;
    if (match[1] && !/^eslint|^@ts-|^global /.test(match[1])) out.push(match[1].trim());
  }
  return out.join(' ').replace(/\s+/g, ' ').slice(0, 220);
}

export function parseFile(relPath, content) {
  const lang = fileLanguage(relPath);
  const lines = String(content || '').split(/\r?\n/);
  const symbols = [];
  if (lang && lang !== 'text') {
    lines.forEach((line, i) => {
      const symbol = symbolAt(lang, line);
      if (symbol && symbols.length < 400) {
        symbols.push({ ...symbol, line: i + 1, exported: /^\s*export\s/.test(line) });
      }
    });
  }
  let specifiers = [];
  if (lang === 'js') specifiers = jsImports(content);
  else if (lang === 'py') specifiers = pyImports(content);
  else if (lang === 'css') specifiers = cssImports(content);
  const words = new Set(wordsOf(relPath));
  for (const word of wordsOf(content)) words.add(word);
  return {
    lang: lang || 'text',
    lines: lines.length,
    about: leadingComment(lines),
    symbols,
    specifiers,
    words,
  };
}
