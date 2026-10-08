// Browser side of the Figma import. The token never comes back from the
// server; it goes in once through the shared key vault (/api/keys).

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { code: data.code, status: res.status });
  return data;
}

export const figmaApi = {
  status: (fetchImpl = globalThis.fetch) => fetchImpl('/api/design/figma/status', { credentials: 'include' }).then(json),
  connect: (token, fetchImpl = globalThis.fetch) => fetchImpl('/api/keys', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'figma', apiKey: token }),
  }).then(json),
  disconnect: (fetchImpl = globalThis.fetch) => fetchImpl('/api/keys/figma', { method: 'DELETE', credentials: 'include' }).then(json),
  frames: (url, fetchImpl = globalThis.fetch) => fetchImpl(`/api/design/figma/frames?url=${encodeURIComponent(url)}`, { credentials: 'include' }).then(json),
  importFrame: (url, nodeId, fetchImpl = globalThis.fetch) => fetchImpl('/api/design/figma/import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, nodeId }),
  }).then(json),
};

const GAP = 64;
const MAX_BLOCK_HEIGHT = 1200;

/**
 * Lay imported frames out in a row to the right of the Figma window, at their
 * real Figma size (tall pages scroll inside their block).
 */
export function layoutImportedFrames(origin, frames) {
  let x = (origin.x || 0) + (origin.w || 0) + GAP;
  return frames.map((frame) => {
    const w = Math.max(120, Math.round(frame.width || 800));
    const h = Math.max(80, Math.min(MAX_BLOCK_HEIGHT, Math.round(frame.height || 600)));
    const placed = { pos: { x, y: origin.y || 0 }, size: { w, h } };
    x += w + GAP;
    return placed;
  });
}

/** Window props for one imported frame. */
export function designBlockFromImport(result, fileUrl) {
  return {
    title: result.name,
    source: result.html,
    sourceType: 'html',
    renderUrl: result.renderUrl || null,
    view: 'live',
    frameless: true,
    bare: true,
    figma: { fileKey: result.fileKey, nodeId: result.nodeId, fileName: result.fileName || null, url: fileUrl },
  };
}
