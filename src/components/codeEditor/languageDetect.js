// Language detection for the code editor — file extension first, then
// explicit win.language, then content sniffing. Pure: no DOM, no deps.

const EXTENSION_TO_LANGUAGE = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'jsx', ts: 'typescript', mts: 'typescript', cts: 'typescript',
  tsx: 'tsx', html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  astro: 'html', css: 'css', scss: 'css', less: 'css',
  json: 'json', jsonc: 'json', webmanifest: 'json',
  py: 'python', rb: 'python', md: 'markdown', markdown: 'markdown',
  yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml',
  sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'shell',
  java: 'java', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
  go: 'go', rs: 'rust', php: 'php', lua: 'lua', toml: 'toml', ini: 'ini',
};

const ALIAS_TO_LANGUAGE = {
  javascript: 'javascript', js: 'javascript', jsx: 'jsx',
  typescript: 'typescript', ts: 'typescript', tsx: 'tsx',
  html: 'html', css: 'css', json: 'json', python: 'python', py: 'python',
  markdown: 'markdown', md: 'markdown', yaml: 'yaml', yml: 'yaml',
  xml: 'xml', sql: 'sql', shell: 'shell', plaintext: 'plaintext', text: 'plaintext',
};

const PRETTIER_PARSER_FOR_LANGUAGE = {
  javascript: 'babel', jsx: 'babel', typescript: 'typescript', tsx: 'typescript',
  html: 'html', vue: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', markdown: 'markdown', yaml: 'yaml', graphql: 'graphql',
};

export function extensionForFileName(name) {
  if (typeof name !== 'string') return '';
  const base = name.split(/[?#]/)[0].split('/').pop();
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function sniffLanguageFromCode(code) {
  if (typeof code !== 'string' || code.trim().length === 0) return '';
  const text = code.trim();
  if (/^<!doctype html/i.test(text) || /<html[\s>]/i.test(text)) return 'html';
  if (/^\s*[{[]/.test(text)) {
    try { JSON.parse(text); return 'json'; } catch { /* not JSON */ }
  }
  if (/^\s*(import|export|const|let|var|function)\b/m.test(text) && /[{}();]/.test(text)) {
    return /<\w+.*>/.test(text) && /return\s*\(/.test(text) ? 'jsx' : 'javascript';
  }
  if (/^\s*(def |import |from \w+ import|print\()/.test(text)) return 'python';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(text)) return 'sql';
  if (/^#{1,6}\s+\S/m.test(text) || /^\s*[-*]\s+\[.?\]/m.test(text)) return 'markdown';
  if (/<[a-z][\s\S]*>/i.test(text) && /<\/[a-z]+\s*>/i.test(text)) return 'html';
  return '';
}

// Detects the editor language. Precedence: explicit win.language (when
// recognized) → file extension → content sniffing → 'plaintext'.
export function detectLanguage({ fileName, filePath, language, code } = {}) {
  const explicit = typeof language === 'string' ? ALIAS_TO_LANGUAGE[language.toLowerCase()] : '';
  if (explicit) return explicit;
  const ext = extensionForFileName(fileName || filePath || '');
  if (ext && EXTENSION_TO_LANGUAGE[ext]) return EXTENSION_TO_LANGUAGE[ext];
  const sniffed = sniffLanguageFromCode(code);
  if (sniffed) return sniffed;
  return 'plaintext';
}

export function prettierParserForLanguage(language) {
  return PRETTIER_PARSER_FOR_LANGUAGE[language] || null;
}

export function isFormattableLanguage(language) {
  return prettierParserForLanguage(language) !== null;
}

export function displayNameForLanguage(language) {
  const names = {
    javascript: 'JavaScript', jsx: 'JSX', typescript: 'TypeScript', tsx: 'TSX',
    html: 'HTML', css: 'CSS', json: 'JSON', python: 'Python', markdown: 'Markdown',
    yaml: 'YAML', xml: 'XML', sql: 'SQL', shell: 'Shell', plaintext: 'Plain text',
  };
  return names[language] || language || 'Plain text';
}
