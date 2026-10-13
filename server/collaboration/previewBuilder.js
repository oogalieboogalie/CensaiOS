// Agnostic visual-preview builder for the `project_preview` agent tool.
//
// One tool, many visual types: the agent declares `preview_type` and hands
// over source, and this module wraps it into a standalone HTML document that
// the canvas `htmlPreview` window can render in its sandboxed iframe. New
// types (e.g. a future `project_terminal` cast, svelte, vue) plug in here as
// another case — the tool schema, handler, and canvas plumbing stay stable.

export const PREVIEW_TYPES = Object.freeze(['html', 'threejs', 'react', 'css', 'tailwind']);

export const MAX_PREVIEW_BYTES = 64 * 1024;

const THREE_VERSION = '0.160.0';
const THREE_IMPORTMAP = `{
  "imports": {
    "three": "https://unpkg.com/three@${THREE_VERSION}/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@${THREE_VERSION}/examples/jsm/"
  }
}`;

function isFullDocument(source) {
  return /<\s*html[\s>]/i.test(source);
}

function wrapFragment(bodyContent) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview</title>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

function injectBeforeHeadClose(documentHtml, snippet) {
  if (/<\/head\s*>/i.test(documentHtml)) {
    return documentHtml.replace(/<\/head\s*>/i, `${snippet}\n</head>`);
  }
  return snippet + documentHtml;
}

function buildHtml(source) {
  return isFullDocument(source) ? source : wrapFragment(source);
}

function buildTailwind(source) {
  const cdn = '<script src="https://cdn.tailwindcss.com"></script>';
  if (isFullDocument(source)) return injectBeforeHeadClose(source, cdn);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview</title>
${cdn}
</head>
<body>
${source}
</body>
</html>`;
}

function buildCss(source) {
  // Bare CSS has nothing to render on its own, so ship it with a kitchen-sink
  // demo body that exercises common selectors (elements, classes, ids).
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CSS Preview</title>
<style>
${source}
</style>
</head>
<body>
<main class="container" id="preview-root">
<h1>CSS Preview</h1>
<h2>Live stylesheet demo</h2>
<p>This paragraph, the headings, the link, and the controls below all render through the projected stylesheet. Edit the CSS and re-project to iterate.</p>
<p><a href="#" onclick="return false">Example link</a></p>
<button type="button">Example button</button>
<input type="text" placeholder="Example input">
<div class="card"><h3>Card block</h3><p>Useful when the stylesheet targets <code>.card</code>, grids, or layout containers.</p></div>
</main>
</body>
</html>`;
}

function buildThreejs(source) {
  if (isFullDocument(source)) return source;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Three.js Preview</title>
<style>html, body { margin: 0; height: 100%; overflow: hidden; background: #0b0e14; } canvas { display: block; }</style>
<script type="importmap">${THREE_IMPORTMAP}</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
${source}
</script>
</body>
</html>`;
}

function buildReact(source) {
  if (isFullDocument(source)) return source;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>React Preview</title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
${source}
</script>
</body>
</html>`;
}

/**
 * Wrap agent-supplied source for `previewType` into a standalone HTML
 * document. Unknown/future types fall through as raw HTML so the tool stays
 * forward-compatible without a schema change.
 */
export function buildPreviewHtml(previewType, content) {
  const source = String(content ?? '');
  if (!source.trim()) {
    throw new Error('content is required and must not be empty.');
  }
  const type = String(previewType || 'html').trim().toLowerCase();
  switch (type) {
    case 'html':
      return buildHtml(source);
    case 'tailwind':
      return buildTailwind(source);
    case 'css':
      return buildCss(source);
    case 'threejs':
    case 'three.js':
    case 'three':
      return buildThreejs(source);
    case 'react':
      return buildReact(source);
    default:
      return buildHtml(source);
  }
}

/** Normalize the requested type for storage; unknown types stay verbatim. */
export function normalizePreviewType(previewType) {
  const type = String(previewType || 'html').trim().toLowerCase();
  if (type === 'three.js' || type === 'three') return 'threejs';
  return type || 'html';
}

function safeFileStem(title) {
  const stem = String(title || 'preview')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return stem || 'preview';
}

/**
 * Build the canvas-window payload for a projected preview: kind, file name,
 * title, and the wrapped standalone HTML.
 */
export function buildPreviewWindow({ title, previewType = 'html', content }) {
  const label = String(title || 'Preview').trim() || 'Preview';
  const type = normalizePreviewType(previewType);
  const html = buildPreviewHtml(type, content);
  if (Buffer.byteLength(html, 'utf8') > MAX_PREVIEW_BYTES) {
    throw new Error(`Preview HTML exceeds ${MAX_PREVIEW_BYTES} UTF-8 bytes after wrapping.`);
  }
  return {
    kind: 'htmlPreview',
    title: label.slice(0, 120),
    fileName: `${safeFileStem(label)}.html`,
    previewType: type,
    html,
  };
}
