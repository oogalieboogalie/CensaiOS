// Figma file -> canvas. Two steps the window drives:
//   listFigmaFrames: what can be pulled in (frames on each page, including
//     frames kept inside a SECTION, plus thumbnails)
//   importFigmaFrame: one frame as editable HTML plus a pixel render for reference

import { collectVectorIds, figmaNodeToHtml, hasImageFills, MAX_NODES } from './figmaToHtml.js';
import { framesInDocument, FIGMA_LIST_DEPTH } from './figmaSections.js';
import { logFigmaFrameMissing, logFigmaImport } from './figmaImportLog.js';

const MAX_FRAMES = 60;
const MAX_THUMBNAILS = 24;
const MAX_REMEMBERED = 100;

// Frames found per file at its last listing, for the import log line, so an
// import never reads the whole file again just to count.
const listedCounts = new Map();

function rememberCount(fileKey, count) {
  listedCounts.delete(fileKey);
  listedCounts.set(fileKey, count);
  if (listedCounts.size > MAX_REMEMBERED) listedCounts.delete(listedCounts.keys().next().value);
}

/**
 * How faithful the generated code is likely to be. Frames that are mostly
 * vector art or bitmaps (illustrations, icon sheets), or that were cut off at
 * the node limit, read better as Figma's own render until someone edits them.
 */
export function importFidelity(stats = {}) {
  const nodes = stats.nodes || 0;
  if (nodes >= MAX_NODES) return 'low';
  if (nodes >= 8 && ((stats.vectors || 0) + (stats.images || 0)) / nodes > 0.6) return 'low';
  return 'high';
}

function listedFrames(file) {
  return framesInDocument(file?.document).slice(0, MAX_FRAMES);
}

export async function listFigmaFrames(client, fileKey, { nodeId } = {}) {
  // Depth reaches inside a SECTION so frames kept there can be picked.
  const file = await client.file(fileKey, { depth: FIGMA_LIST_DEPTH });
  const frames = listedFrames(file);
  rememberCount(fileKey, frames.length);

  const thumbIds = frames.slice(0, MAX_THUMBNAILS).map(f => f.id);
  if (thumbIds.length) {
    try {
      const { images = {} } = await client.images(fileKey, thumbIds, { format: 'png', scale: 0.25 });
      for (const frame of frames) frame.thumbnailUrl = images[frame.id] || null;
    } catch {
      // Thumbnails are a nicety; the list still works without them.
    }
  }

  const missing = Boolean(nodeId) && !frames.some((frame) => frame.id === nodeId);
  if (missing) logFigmaFrameMissing({ fileKey, nodeId });

  return {
    fileKey,
    name: file?.name || 'Figma file',
    lastModified: file?.lastModified || null,
    thumbnailUrl: file?.thumbnailUrl || null,
    frames,
    linkFrameId: missing || !nodeId ? null : nodeId,
    linkError: missing ? 'That frame is not in this file.' : null,
  };
}

export async function importFigmaFrame(client, fileKey, nodeId) {
  const framesFound = listedCounts.get(fileKey) ?? null;
  const data = await client.nodes(fileKey, [nodeId]);
  const root = data?.nodes?.[nodeId]?.document;
  if (!root) {
    logFigmaFrameMissing({ fileKey, nodeId });
    throw Object.assign(new Error('That frame was not found in the Figma file.'), { statusCode: 404, code: 'FIGMA_NOT_FOUND' });
  }

  const vectorIds = collectVectorIds(root);
  const [svgRender, imageFills, pixelRender] = await Promise.all([
    vectorIds.length
      ? client.images(fileKey, vectorIds, { format: 'svg' }).catch(() => ({ images: {} }))
      : { images: {} },
    hasImageFills(root)
      ? client.imageFills(fileKey).catch(() => ({ meta: { images: {} } }))
      : { meta: { images: {} } },
    client.images(fileKey, [nodeId], { format: 'png', scale: 2 }).catch(() => ({ images: {} })),
  ]);

  const converted = figmaNodeToHtml(root, {
    svgUrls: svgRender?.images || {},
    imageUrls: imageFills?.meta?.images || {},
  });

  logFigmaImport({ fileKey, framesFound, imported: nodeId });

  return {
    fileKey,
    nodeId,
    name: root.name || 'Figma frame',
    fileName: data?.name || null,
    width: converted.width,
    height: converted.height,
    html: converted.html,
    fonts: converted.fonts,
    stats: converted.stats,
    fidelity: importFidelity(converted.stats),
    lastModified: data?.lastModified || null,
    renderUrl: pixelRender?.images?.[nodeId] || null,
  };
}
