// File types for chat attachments: plain-text files are inlined as text for
// every model, PDFs go to models that read them. Split out of
// modelCapabilities.js (which re-exports these) to keep it within budget.

const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'xml', 'html', 'htm',
  'css', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h',
  'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'toml', 'ini', 'env', 'log', 'swift',
  'vue', 'svelte', 'graphql', 'proto', 'r', 'lua', 'dart', 'scala',
]);

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

export function fileExtension(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function isTextFile(name, mime) {
  const m = lower(mime);
  if (m.startsWith('text/')) return true;
  if (/(json|xml|yaml|javascript|typescript|x-sh|sql|csv|toml)/.test(m)) return true;
  return TEXT_FILE_EXTENSIONS.has(fileExtension(name));
}

export function isPdf(name, mime) {
  return lower(mime) === 'application/pdf' || fileExtension(name) === 'pdf';
}
