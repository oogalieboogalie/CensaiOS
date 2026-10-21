// Frames a person can pull onto the board, including frames kept inside a
// Figma Section. A Section is a container, not a frame: its children are
// listed under the section's name. Depth 3 is the shallowest Figma file
// read that includes those children (1 = pages, 2 = top of each page).

import { parseFigmaFileUrl } from './figmaClient.js';

export const FIGMA_LIST_DEPTH = 3;

const PICKABLE = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP']);

function frameRecord(node, page, section) {
  const box = node.absoluteBoundingBox || {};
  return {
    id: node.id,
    name: node.name || node.type,
    type: node.type,
    page,
    section: section || '',
    width: Math.round(box.width || 0),
    height: Math.round(box.height || 0),
    thumbnailUrl: null,
  };
}

function collect(node, page, section, out) {
  if (!node || node.visible === false) return;
  if (node.type === 'SECTION') {
    const name = String(node.name || '').trim() || 'Section';
    for (const child of node.children || []) collect(child, page, name, out);
    return;
  }
  if (PICKABLE.has(node.type)) out.push(frameRecord(node, page, section));
}

/** Pickable frames in document order. `section` is set for frames inside a Section. */
export function framesInDocument(document) {
  const frames = [];
  for (const page of document?.children || []) {
    const pageName = page.name || '';
    for (const node of page.children || []) collect(node, pageName, '', frames);
  }
  return frames;
}

/**
 * The frame a share link points at, or a reason it cannot be selected.
 * Share links write node ids as 12-34; the file uses 12:34.
 */
export function frameForShareLink(frames, url) {
  const parsed = parseFigmaFileUrl(url);
  if (!parsed) return { frame: null, reason: 'Paste a Figma file link (figma.com/design/...).' };
  if (!parsed.nodeId) return { frame: null, reason: 'This link does not point at a frame.' };
  const frame = (frames || []).find((item) => item.id === parsed.nodeId) || null;
  if (!frame) return { frame: null, reason: 'That frame is not in this file.' };
  return { frame, reason: null };
}
