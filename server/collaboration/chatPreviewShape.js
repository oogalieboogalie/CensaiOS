// CHAT LIVE PREVIEW — pure data shared by the server writer and its tests.
// When an agent in a chat writes a file people can look at (a web page, an
// SVG, a markdown note, an image), one preview window sits beside that chat,
// linked to it with a line, and refreshes every time the agent changes the
// file. The preview is an ordinary htmlPreview window carrying `chatId`, so
// it syncs through the Yjs canvas doc like every other window.

import path from 'path';
import { markdownToHtml } from './markdownPreview.js';

export const CHAT_PREVIEW_KIND = 'htmlPreview';
export const CHAT_PREVIEW_SIZE = Object.freeze({ w: 720, h: 520 });
export const MAX_FILE_PREVIEW_BYTES = 256 * 1024;
const MAX_ASSET_BYTES = 128 * 1024;
const MAX_ASSETS = 12;
const GAP = 40;

const KIND_BY_EXT = Object.freeze({
  '.html': 'html', '.htm': 'html',
  '.svg': 'svg',
  '.md': 'markdown', '.markdown': 'markdown',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image',
  '.css': 'asset', '.js': 'asset', '.mjs': 'asset',
});
const IMAGE_TYPES = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' });

/** What a written file can be shown as: html, svg, markdown, image, asset (css/js) or null. */
export function previewKindForPath(filePath) {
  return KIND_BY_EXT[path.posix.extname(String(filePath || '').toLowerCase())] || null;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(title, body, style = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>`
    + `<style>body{margin:0;font-family:system-ui,sans-serif;line-height:1.55;color:#1d1d1f;background:#fff}${style}</style>`
    + `</head><body>${body}</body></html>`;
}

/** An image file's text as a data URL (agents write images as base64 or data URLs). */
export function imageDataUrl(filePath, content) {
  const text = String(content || '').trim();
  if (/^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=\s]+$/i.test(text)) return text.replace(/\s+/g, '');
  const compact = text.replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/]+=*$/.test(compact)) return null;
  const type = IMAGE_TYPES[path.posix.extname(String(filePath).toLowerCase())] || 'image/png';
  return `data:${type};base64,${compact}`;
}

/** Turn one file's text into a standalone page for the preview window. */
export function filePreviewHtml(kind, filePath, content) {
  const name = path.posix.basename(String(filePath || 'preview'));
  const text = String(content ?? '');
  if (kind === 'html') return text;
  if (kind === 'svg') {
    return page(name, `<div class="stage">${text}</div>`,
      '.stage{min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box}.stage svg{max-width:100%;height:auto}');
  }
  if (kind === 'markdown') {
    return page(name, `<article>${markdownToHtml(text)}</article>`,
      'article{max-width:760px;margin:0 auto;padding:28px 32px}pre{background:#f4f4f6;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace;font-size:.92em}img{max-width:100%}');
  }
  if (kind === 'image') {
    const src = imageDataUrl(filePath, text);
    if (!src) return page(name, `<p style="padding:24px">${escapeHtml(name)} is not an image the preview can read.</p>`);
    return page(name, `<div class="stage"><img alt="${escapeHtml(name)}" src="${src}"></div>`,
      '.stage{min-height:100vh;display:grid;place-items:center;background:#111}.stage img{max-width:100%;max-height:100vh}');
  }
  return page(name, `<pre style="padding:16px;white-space:pre-wrap">${escapeHtml(text)}</pre>`);
}

/** A page that says the file is too big, so the preview never blows the doc limit. */
export function tooBigHtml(filePath, bytes) {
  const name = path.posix.basename(String(filePath || 'file'));
  return page(name, `<p style="padding:24px">${escapeHtml(name)} is ${Math.round(bytes / 1024)} KB, too big to preview here (the limit is ${MAX_FILE_PREVIEW_BYTES / 1024} KB).</p>`);
}

function isLocalRef(ref) {
  const value = String(ref || '').trim();
  return Boolean(value) && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
}

/** Where a page's relative asset lives inside the project, or null if it escapes. */
export function assetPath(htmlPath, ref) {
  const clean = String(ref).split(/[?#]/)[0];
  const base = path.posix.dirname(String(htmlPath || 'index.html'));
  const joined = clean.startsWith('/') ? clean.slice(1) : path.posix.join(base, clean);
  const normal = path.posix.normalize(joined);
  return normal.startsWith('..') ? null : normal;
}

/**
 * Inline a page's own stylesheets and scripts (relative <link href> and
 * <script src>), so a site split into index.html + style.css + app.js shows
 * whole in the sandboxed preview. `readAsset(relPath)` returns text or null.
 */
export async function inlineLocalAssets(html, htmlPath, readAsset) {
  const tags = [];
  const linkRe = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi;
  const scriptRe = /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi;
  for (const match of html.matchAll(linkRe)) {
    const href = /\bhref=["']([^"']+)["']/i.exec(match[0])?.[1];
    if (isLocalRef(href)) tags.push({ tag: match[0], ref: href, type: 'style' });
  }
  for (const match of html.matchAll(scriptRe)) {
    if (isLocalRef(match[2])) tags.push({ tag: match[0], ref: match[2], type: 'script', attrs: `${match[1]} ${match[3]}` });
  }
  const used = [];
  let out = html;
  for (const item of tags.slice(0, MAX_ASSETS)) {
    const rel = assetPath(htmlPath, item.ref);
    const text = rel ? await readAsset(rel).catch(() => null) : null;
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_ASSET_BYTES) continue;
    const safe = text.replace(/<\/(style|script)/gi, '<\\/$1');
    const module = /type=["']?module/i.test(item.attrs || '') ? ' type="module"' : '';
    out = out.replace(item.tag, () => (item.type === 'style'
      ? `<style data-from="${escapeHtml(rel)}">${safe}</style>`
      : `<script${module} data-from="${escapeHtml(rel)}">${safe}</script>`));
    used.push(rel);
  }
  return { html: out, assets: used };
}

/** The chat's own preview window on the board, if it has one. */
export function findChatPreview(wins, chatId) {
  return (wins || []).find((win) => win?.kind === CHAT_PREVIEW_KIND && win.chatId === chatId) || null;
}

function overlaps(a, b) {
  return a.x < (b.x || 0) + (b.w || 400) && a.x + a.w > (b.x || 0)
    && a.y < (b.y || 0) + (b.h || 300) && a.y + a.h > (b.y || 0);
}

/** Right of the chat, top edges lined up; slides down past anything in the way. */
export function chatPreviewPosition(chatWin, wins = []) {
  const at = {
    x: Math.round((chatWin?.x || 0) + (chatWin?.w || 400) + GAP),
    y: Math.round(chatWin?.y || 0),
    ...CHAT_PREVIEW_SIZE,
  };
  const others = wins.filter((win) => win && win.id !== chatWin?.id && Number.isFinite(win.x) && Number.isFinite(win.y));
  for (let step = 0; step < 40; step += 1) {
    const hit = others.find((win) => overlaps(at, win));
    if (!hit) break;
    at.y = Math.round(hit.y + (hit.h || 300) + GAP);
  }
  return { x: at.x, y: at.y };
}

/** The preview window record (new, or the chat's existing one refreshed). */
export function chatPreviewWindow({ id, existing = null, chatWin, wins = [], agentId, title, fileName, html, previewType, source = null, now = new Date().toISOString() }) {
  const base = existing || {
    id: String(id),
    kind: CHAT_PREVIEW_KIND,
    ...chatPreviewPosition(chatWin, wins),
    ...CHAT_PREVIEW_SIZE,
    chatId: chatWin.id,
    createdBy: agentId ? `agent:${agentId}` : null,
  };
  return {
    ...base,
    title: String(title || fileName || 'Live preview').slice(0, 120),
    fileName: String(fileName || 'preview.html').slice(0, 200),
    html: String(html || ''),
    previewType: previewType || 'html',
    previewSource: source,
    previewAgentId: agentId || null,
    previewRevision: (Number(existing?.previewRevision) || 0) + 1,
    updatedAt: now,
  };
}
