// "Export as one file": a module as a standalone HTML page that opens in any
// browser. It starts with the same header comment the example modules use,
// so the file also carries its manifest and request.

import { buildModuleDocument } from './moduleDocument.js';

export function moduleFileName(name) {
  const stem = String(name || 'module').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `${stem || 'module'}.html`;
}

export function moduleFileText({ request = '', manifest, source }, tokens = {}) {
  const header = JSON.stringify({ request, manifest }).replace(/--/g, '-\\u002d');
  return `<!-- module ${header} -->\n${buildModuleDocument(source, { tokens })}`;
}

export function downloadModuleFile(win, tokens) {
  const blob = new Blob([moduleFileText(win, tokens)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = moduleFileName(win.manifest?.name || win.title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
