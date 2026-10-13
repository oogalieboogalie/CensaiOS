// Design blocks: code that renders straight onto the canvas with no window
// chrome around it (the Stitch / Claude Design look). This module decides
// what pasted text is renderable UI and wraps it into a document the
// sandboxed iframe can show.

import { buildPreviewHtml } from '../../../server/collaboration/previewBuilder.js';

export const DESIGN_SOURCE_TYPES = Object.freeze(['html', 'tailwind', 'react', 'svg', 'css']);

const FIGMA_LINK = /^https?:\/\/([\w-]+\.)?figma\.com\/(file|design|proto)\/[A-Za-z0-9]+\S*$/i;
const HTML_TAGS = /<\/?(div|section|main|header|nav|footer|button|h[1-6]|p|span|body|form|ul|ol|li|img|a|article|aside|table|style|input|label)\b/i;
const TAILWIND_HINT = /class(?:Name)?="[^"]*\b(?:flex|grid|bg-[a-z]+-\d{2,3}|text-(?:xs|sm|base|lg|[2-9]?xl)|p[xytrbl]?-\d|m[xytrbl]?-\d|rounded(?:-\w+)?|gap-\d)\b/;
const COMPONENT_DECL = /(?:function\s+[A-Z]\w*\s*\(|const\s+[A-Z]\w*\s*=|export\s+default\b)/;

/**
 * What a paste on the canvas should become.
 *   { kind: 'figma', url }               a Figma file link
 *   { kind: 'design', sourceType }       renderable UI (HTML, Tailwind, JSX, SVG)
 *   null                                 anything else (falls back to code / note)
 */
export function classifyPastedDesign(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (FIGMA_LINK.test(t)) return { kind: 'figma', url: t };
  if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t) && /<\/svg>\s*$/i.test(t)) {
    return { kind: 'design', sourceType: 'svg' };
  }
  if (COMPONENT_DECL.test(t) && /\breturn\s*\(?\s*<[A-Za-z>]/.test(t)) {
    return { kind: 'design', sourceType: 'react' };
  }
  const fullDoc = /^<!doctype html|^<html[\s>]/i.test(t);
  if (fullDoc || (t.startsWith('<') && HTML_TAGS.test(t) && /<\/[a-z]/i.test(t))) {
    const styled = /<link[^>]+stylesheet|<style[\s>]/i.test(t);
    return { kind: 'design', sourceType: !styled && TAILWIND_HINT.test(t) ? 'tailwind' : 'html' };
  }
  return null;
}

export function normalizeDesignSourceType(value) {
  const type = String(value || '').trim().toLowerCase();
  return DESIGN_SOURCE_TYPES.includes(type) ? type : 'html';
}

const RESET = '<style>html, body { margin: 0; background: transparent; }</style>';

function isFullDocument(source) {
  return /<\s*html[\s>]/i.test(source);
}

function withReset(doc) {
  return /<\/head\s*>/i.test(doc) ? doc.replace(/<\/head\s*>/i, `${RESET}\n</head>`) : `${RESET}${doc}`;
}

const REACT_HOOKS = 'const { useState, useEffect, useMemo, useRef, useCallback, useReducer, useContext, createContext, Fragment } = React;';

/**
 * Pasted components (v0, Stitch exports, model output) usually arrive as a
 * module: imports at the top, `export default function App`. Make that run
 * as a classic Babel script and mount the component it exports.
 */
export function prepareReactSource(source) {
  let code = String(source || '')
    .replace(/^\s*import\s[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?[ \t]*$/gm, '');
  let name = null;
  const defaultFn = code.match(/export\s+default\s+function\s+([A-Z]\w*)/);
  if (defaultFn) name = defaultFn[1];
  code = code.replace(/export\s+default\s+function\b/, 'function');
  const defaultRef = code.match(/export\s+default\s+([A-Z]\w*)\s*;?/);
  if (!name && defaultRef) name = defaultRef[1];
  code = code.replace(/export\s+default\s+([A-Z]\w*)\s*;?/, '');
  code = code.replace(/export\s+(const|let|function|class)\b/g, '$1');
  if (!name) {
    const decls = [...code.matchAll(/(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=)/g)];
    const last = decls[decls.length - 1];
    if (last) name = last[1] || last[2];
  }
  const prelude = /\b(?:const|let|var)\s*\{[^}]*\}\s*=\s*React\b/.test(code) ? '' : `${REACT_HOOKS}\n`;
  const mounts = /createRoot\s*\(|ReactDOM\.render\s*\(/.test(code);
  const mount = !mounts && name
    ? `\nReactDOM.createRoot(document.getElementById('root')).render(<${name} />);`
    : '';
  return { code: `${prelude}${code.trim()}${mount}\n`, componentName: name };
}

function buildReactDocument(source) {
  if (isFullDocument(source)) return source;
  const { code } = prepareReactSource(source);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
${RESET}
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
${code}</script>
</body>
</html>`;
}

function buildSvgDocument(source) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>html, body { margin: 0; height: 100%; background: transparent; } body { display: flex; } body > svg { width: 100%; height: 100%; }</style>
</head>
<body>
${source}
</body>
</html>`;
}

/** Wrap a design block's source into the document its iframe renders. */
export function buildDesignDocument(sourceType, source) {
  const text = String(source || '');
  if (!text.trim()) return '';
  const type = normalizeDesignSourceType(sourceType);
  if (type === 'react') return buildReactDocument(text);
  if (type === 'svg') return buildSvgDocument(text);
  const doc = buildPreviewHtml(type, text);
  return isFullDocument(text) ? doc : withReset(doc);
}

/** A starting size for pasted code: SVG viewBox when present, else a desktop-ish board. */
export function suggestDesignSize(sourceType, source) {
  if (sourceType === 'svg') {
    const vb = String(source).match(/viewBox\s*=\s*"[\d.\s-]+?\s([\d.]+)\s+([\d.]+)"/i);
    if (vb) {
      const w = Math.round(Number(vb[1]));
      const h = Math.round(Number(vb[2]));
      if (w > 0 && h > 0) {
        const scale = Math.min(1, 900 / w, 700 / h);
        return { w: Math.max(80, Math.round(w * scale)), h: Math.max(80, Math.round(h * scale)) };
      }
    }
    return { w: 360, h: 360 };
  }
  return { w: 960, h: 640 };
}
