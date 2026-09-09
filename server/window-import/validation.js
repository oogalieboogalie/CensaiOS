const FORBIDDEN_PATTERNS = [
  { code: 'child_process', pattern: /\bchild_process\b/ },
  { code: 'fs', pattern: /\bfs\b/ },
  { code: 'eval', pattern: /\beval\s*\(/ },
  { code: 'new-function', pattern: /\bnew\s+Function\b/ },
  { code: 'import-http', pattern: /import\s*\(\s*['"]https?:/ },
  { code: 'document-cookie', pattern: /\bdocument\s*\.\s*cookie\b/ },
  { code: 'local-storage', pattern: /\blocalStorage\b/ },
  { code: 'session-storage', pattern: /\bsessionStorage\b/ },
  { code: 'import-meta-env', pattern: /\bimport\s*\.\s*meta\s*\.\s*env\b/ },
  { code: 'fetch-http', pattern: /\bfetch\s*\(\s*['"]https?:\/\// },
  { code: 'websocket', pattern: /\bnew\s+WebSocket\s*\(\s*['"]wss?:\/\// },
  { code: 'dangerous-html', pattern: /\bdangerouslySetInnerHTML\b/ },
  { code: 'iframe-srcdoc', pattern: /\bsrcDoc\s*=/ },
  { code: 'script-element', pattern: /\bdocument\s*\.\s*createElement\s*\(\s*['"]script['"]\s*\)/ },
  { code: 'inner-html', pattern: /\binnerHTML\s*=/ },
  { code: 'outer-html', pattern: /\bouterHTML\s*=/ },
  { code: 'window-location', pattern: /\bwindow\s*\.\s*location\s*=/ },
  { code: 'location-href', pattern: /\blocation\s*\.\s*href\s*=/ },
  { code: 'clipboard-write', pattern: /\bnavigator\s*\.\s*clipboard\s*\.\s*writeText\s*\(/ },
];

export function slugifyWindowKind(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^./, char => char.toLowerCase());
}

export function windowComponentName(value) {
  const slug = slugifyWindowKind(value || 'Imported Window');
  const name = slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'ImportedWindow';
  return `${name}Window`;
}

export function validateGeneratedWindow({ kind, label, rawJsx, rawCss }) {
  const suggestedKind = slugifyWindowKind(kind || label || 'Imported Window');
  const combined = [rawJsx || '', rawCss || ''].join('\n');
  const issues = FORBIDDEN_PATTERNS
    .filter(entry => entry.pattern.test(combined))
    .map(entry => ({
      code: entry.code,
      message: `Generated code contains blocked pattern: ${entry.code}`,
    }));

  return {
    ok: issues.length === 0,
    suggestedKind,
    componentName: windowComponentName(suggestedKind),
    issues,
  };
}
