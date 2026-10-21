// Answers the app's /api calls inside the browser for the try-it board.
// Nothing leaves the page and nothing is kept: the board lives in memory and
// a reload starts over. Unknown calls get an empty answer so every window
// still opens, and the log records which feature was turned down. Anything
// that would need a real server says so plainly.
import { demoChatStream } from './demoChat.js';
import { declineFeature } from './declineUnknown.js';

export const DEMO_USER = { id: 'demo-visitor', email: 'visitor@try.censai.app', name: '', role: 'owner' };
export const DEMO_WORKSPACE = 'demo-board';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

function readBody(init) {
  try { return init?.body ? JSON.parse(init.body) : {}; } catch { return {}; }
}

let revision = 0;

/** The answer for one /api request, as a Response. */
export async function demoResponse(path, init = {}) {
  const url = new URL(path, 'http://demo.local');
  const p = url.pathname;
  const method = String(init.method || 'GET').toUpperCase();

  if (p === '/api/auth/session') {
    return json({ authenticated: true, user: DEMO_USER, oauthConfigured: false, demo: true });
  }
  if (p === '/api/system/status') return json({ ok: true, host: { mode: 'demo' }, demo: true });
  if (p.startsWith('/api/client-state/')) {
    // A board the server never stored, so the welcome windows glide in.
    if (method === 'GET') return json({ error: 'not found', workspaceId: DEMO_WORKSPACE }, 404);
    revision += 1;
    return json({ ok: true, revision, workspaceId: DEMO_WORKSPACE });
  }
  // No shared free AI here; chat gives sample replies instead.
  if (p === '/api/ai/free-tier/status') return json({ enabled: false });
  if (p === '/api/projects' || p === '/api/agents') return json([]);
  if (p === '/api/chat' && method === 'POST') {
    const body = readBody(init);
    return new Response(demoChatStream(body.messages), {
      status: 200, headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }
  if (p === '/api/board-templates') {
    const { DEMO_TEMPLATES } = await import('./demoTemplates.js');
    return json({ templates: DEMO_TEMPLATES });
  }
  const applyTemplate = p.match(/^\/api\/board-templates\/([^/]+)\/apply$/);
  if (applyTemplate && method === 'POST') {
    const { demoTemplateBoard } = await import('./demoTemplates.js');
    const board = demoTemplateBoard(decodeURIComponent(applyTemplate[1]));
    return board ? json({ ok: true, board }) : json({ error: 'That template is not on the try-it board.' }, 404);
  }
  if (p === '/api/chat/capabilities') {
    return json({ provider: 'demo', model: 'sample replies', capabilities: { text: true }, limits: {} });
  }
  // Nothing to share keys with here, so that section stays hidden.
  if (p === '/api/key-sharing' || p.startsWith('/api/key-sharing/')) return json({ available: false });
  declineFeature(p);
  if (method === 'GET') return json({});
  return json({ ok: true, demo: true });
}
