// Spec 6: wrap a module's HTML into the document its sandboxed iframe runs.
// The document carries a strict Content Security Policy (no network unless
// granted), the theme tokens, a small base kit so generated modules look
// native without writing much CSS, and the Module SDK.

import { MODULE_SDK_CLIENT } from './moduleSdkClient.js';

// The tokens a module sees. Names match src/styles/tokens.css.
export const MODULE_TOKEN_NAMES = Object.freeze([
  '--surface', '--surface-2', '--surface-3', '--ink', '--ink-soft', '--ink-faint',
  '--hairline', '--hairline-strong', '--accent', '--accent-soft', '--accent-ink', '--accent-text', '--accent-line', '--accent-contrast',
  '--danger', '--success', '--warning', '--on-fill',
  '--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-full',
  '--text-xs', '--text-sm', '--text-md', '--text-base', '--text-lg', '--text-xl', '--text-2xl',
  '--font-sans', '--font-mono', '--font-label', '--label-case',
  '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8',
  '--elevation-1', '--elevation-2', '--dur-fast', '--dur-base', '--ease-standard',
]);

/** Current token values from the host page (live: they follow the theme preset). */
export function readThemeTokens(root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root || typeof getComputedStyle !== 'function') return {};
  const style = getComputedStyle(root);
  const tokens = {};
  for (const name of MODULE_TOKEN_NAMES) {
    const value = style.getPropertyValue(name).trim();
    if (value) tokens[name] = value;
  }
  return tokens;
}

/**
 * The sandbox's Content Security Policy. `network` is false (no internet), true
 * (any https site, for older modules) or the list of sources the manifest's
 * hosts allow (manifest v3: only the sites the module declared). `localFiles`
 * lets the module read files it made itself (blob: and data: addresses, which
 * never leave the box); only built-in sealed windows that open files ask.
 * `wasm` lets code in the box compile WebAssembly (still no JavaScript eval).
 */
export function moduleCsp({ network = false, localFiles = false, wasm = false } = {}) {
  const sources = network === true ? ['https:'] : (Array.isArray(network) ? network.filter(s => /^https:(\/\/[\w.*:-]+)?$/.test(s)) : []);
  const allowed = sources.join(' ');
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline'${wasm ? " 'wasm-unsafe-eval'" : ''}`,
    "style-src 'unsafe-inline'",
    `img-src data: blob:${allowed ? ` ${allowed}` : ''}`,
    'font-src data:',
    'media-src data: blob:',
    `connect-src ${[localFiles ? 'blob: data:' : '', allowed].filter(Boolean).join(' ') || "'none'"}`,
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

const BASE_KIT = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--surface);color:var(--ink);font-family:var(--font-sans);font-size:var(--text-sm);line-height:1.45;-webkit-font-smoothing:antialiased;padding:var(--space-4)}
h1,h2,h3{margin:0 0 var(--space-2);font-weight:600;letter-spacing:-0.01em}
h1{font-size:var(--text-xl)}h2{font-size:var(--text-lg)}h3{font-size:var(--text-md)}
p{margin:0 0 var(--space-2)}
small,.muted{color:var(--ink-soft)}.faint{color:var(--ink-faint)}
.label{font-family:var(--font-label);font-size:var(--text-xs);text-transform:var(--label-case);letter-spacing:.04em;color:var(--ink-faint)}
button{font:inherit;color:var(--ink);background:var(--surface-2);border:1px solid var(--hairline);border-radius:var(--radius-sm);padding:var(--space-1) var(--space-3);min-height:30px;cursor:pointer;transition:background var(--dur-fast) var(--ease-standard)}
button:hover{border-color:var(--hairline-strong)}
button.primary{background:var(--accent);border-color:transparent;color:var(--accent-contrast)}
button.ghost{background:transparent;border-color:transparent}
button.danger{color:var(--danger)}
button:disabled{opacity:.5;cursor:default}
input,select,textarea{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius-sm);padding:var(--space-1) var(--space-2);min-height:30px;width:100%}
input:focus,select:focus,textarea:focus,button:focus-visible{outline:2px solid var(--accent-soft);outline-offset:1px;border-color:var(--accent-line)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:var(--space-2);border-bottom:1px solid var(--hairline)}
th{font-weight:500;color:var(--ink-soft);font-size:var(--text-xs)}
.card{background:var(--surface-2);border:1px solid var(--hairline);border-radius:var(--radius-md);padding:var(--space-3)}
.row{display:flex;gap:var(--space-2);align-items:center}.stack{display:flex;flex-direction:column;gap:var(--space-2)}
.grid{display:grid;gap:var(--space-2)}.spread{display:flex;justify-content:space-between;align-items:center;gap:var(--space-2)}
.pill{display:inline-flex;align-items:center;padding:0 var(--space-2);border-radius:var(--radius-full);background:var(--accent-soft);color:var(--accent-ink);font-size:var(--text-xs);min-height:20px}
.big{font-size:var(--text-2xl);font-weight:600;font-variant-numeric:tabular-nums}
.num{font-variant-numeric:tabular-nums;font-family:var(--font-mono)}
`;

function tokenCss(tokens) {
  return `:root{${Object.entries(tokens || {}).map(([k, v]) => `${k}:${String(v).replace(/[<{}]/g, '')}`).join(';')}}`;
}

// JSON that can sit inside a <script> without closing it.
function inlineJson(value) {
  return JSON.stringify(value ?? null).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, ' ');
}

// What a module may read about itself: its own label, minus nothing secret.
function manifestForModule(manifest) {
  if (!manifest) return null;
  const { id, name, version, permissions, network, tools } = manifest;
  return { id, name, version, permissions, network, tools: (tools || []).map(t => ({ name: t.name, description: t.description })) };
}

/** The full srcdoc for a module. */
export function buildModuleDocument(source, { tokens = {}, storage = {}, presence = [], network = false, manifest = null, localFiles = false, wasm = false } = {}) {
  const body = String(source || '');
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${moduleCsp({ network, localFiles, wasm })}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${tokenCss(tokens)}</style>
<style>${BASE_KIT}</style>
<script>window.__hbInit=${inlineJson({ tokens, storage, presence, manifest: manifestForModule(manifest) })};</script>
<script>${MODULE_SDK_CLIENT}</script>
</head><body>
${body}
</body></html>`;
}
