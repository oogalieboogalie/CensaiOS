// Thin Figma REST client. Auth is BYOK: the signed-in user's vaulted Figma
// personal access token, then the server's FIGMA_API_TOKEN. `fetchImpl` is
// injectable so tests never touch the network.

import { getSecret } from '../secrets.js';

export const FIGMA_API_BASE = 'https://api.figma.com/v1';

const FIGMA_HOST = /(^|\.)figma\.com$/i;
const FILE_PATH = /^\/(file|design|proto|board)\/([A-Za-z0-9]+)/;

/**
 * Pull the file key (and the selected node, when the link has one) out of a
 * Figma share link. Accepts design/file/proto links and embed URLs.
 * Returns null for anything that is not a Figma file link.
 */
export function parseFigmaFileUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!FIGMA_HOST.test(url.hostname)) return null;
  if (url.pathname === '/embed' && url.searchParams.get('url')) {
    return parseFigmaFileUrl(url.searchParams.get('url'));
  }
  const match = url.pathname.match(FILE_PATH);
  if (!match) return null;
  const nodeParam = url.searchParams.get('node-id');
  // Share links write node ids as 12-34; the API wants 12:34.
  const nodeId = nodeParam ? nodeParam.replace(/-/g, ':') : null;
  return { fileKey: match[2], nodeId };
}

export async function resolveFigmaToken(userId, { loadUserKey } = {}) {
  const load = loadUserKey || (async (id) => {
    const { getUserApiKeyConfig } = await import('../security/userApiKeys.js');
    return getUserApiKeyConfig(id, 'figma');
  });
  try {
    const userKey = userId ? await load(userId) : null;
    if (userKey?.apiKey) return { token: userKey.apiKey, source: 'byok' };
  } catch {
    // A vault read failure falls through to the server token.
  }
  const serverToken = getSecret('FIGMA_API_TOKEN');
  if (serverToken) return { token: serverToken, source: 'server' };
  return { token: '', source: null };
}

function figmaError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function createFigmaClient(token, { fetchImpl = globalThis.fetch } = {}) {
  if (!token) {
    throw figmaError('Connect your Figma account to import designs.', 424, 'FIGMA_TOKEN_REQUIRED');
  }

  async function get(pathname, params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    ).toString();
    const res = await fetchImpl(`${FIGMA_API_BASE}${pathname}${query ? `?${query}` : ''}`, {
      headers: { 'X-Figma-Token': token },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw figmaError('Figma rejected the token, or it cannot read this file.', 424, 'FIGMA_TOKEN_INVALID');
      }
      if (res.status === 404) {
        throw figmaError('That Figma file or frame was not found.', 404, 'FIGMA_NOT_FOUND');
      }
      if (res.status === 429) {
        throw figmaError('Figma is rate limiting requests. Try again in a minute.', 429, 'FIGMA_RATE_LIMITED');
      }
      throw figmaError(`Figma request failed (${res.status}).`, 502, 'FIGMA_REQUEST_FAILED');
    }
    return res.json();
  }

  return {
    me: () => get('/me'),
    file: (fileKey, { depth } = {}) => get(`/files/${encodeURIComponent(fileKey)}`, { depth }),
    nodes: (fileKey, ids) => get(`/files/${encodeURIComponent(fileKey)}/nodes`, { ids: ids.join(',') }),
    images: (fileKey, ids, { format = 'png', scale } = {}) => (
      get(`/images/${encodeURIComponent(fileKey)}`, { ids: ids.join(','), format, scale })
    ),
    imageFills: (fileKey) => get(`/files/${encodeURIComponent(fileKey)}/images`),
  };
}
