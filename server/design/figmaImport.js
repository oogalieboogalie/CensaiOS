// Figma file -> canvas. Two steps the window drives:
//   listFigmaFrames: what can be pulled in (top-level frames per page + thumbnails)
//   importFigmaFrame: one frame as editable HTML plus a pixel render for reference

import { collectVectorIds, figmaNodeToHtml, hasImageFills } from './figmaToHtml.js';

const FRAME_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION', 'GROUP']);
const MAX_FRAMES = 60;
const MAX_THUMBNAILS = 24;

export async function listFigmaFrames(client, fileKey) {
  const file = await client.file(fileKey, { depth: 2 });
  const frames = [];
  for (const page of file?.document?.children || []) {
    for (const node of page.children || []) {
      if (frames.length >= MAX_FRAMES) break;
      if (!FRAME_TYPES.has(node.type) || node.visible === false) continue;
      const box = node.absoluteBoundingBox || {};
      frames.push({
        id: node.id,
        name: node.name || node.type,
        type: node.type,
        page: page.name || '',
        width: Math.round(box.width || 0),
        height: Math.round(box.height || 0),
        thumbnailUrl: null,
      });
    }
  }

  const thumbIds = frames.slice(0, MAX_THUMBNAILS).map(f => f.id);
  if (thumbIds.length) {
    try {
      const { images = {} } = await client.images(fileKey, thumbIds, { format: 'png', scale: 0.25 });
      for (const frame of frames) frame.thumbnailUrl = images[frame.id] || null;
    } catch {
      // Thumbnails are a nicety; the list still works without them.
    }
  }

  return {
    fileKey,
    name: file?.name || 'Figma file',
    lastModified: file?.lastModified || null,
    thumbnailUrl: file?.thumbnailUrl || null,
    frames,
  };
}

export async function importFigmaFrame(client, fileKey, nodeId) {
  const data = await client.nodes(fileKey, [nodeId]);
  const root = data?.nodes?.[nodeId]?.document;
  if (!root) {
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
    renderUrl: pixelRender?.images?.[nodeId] || null,
  };
}
