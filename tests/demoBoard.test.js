// The try-it board (src/lib/demo/) answers the app's /api calls in the
// browser: a signed-in visitor, a board the server "never stored" so the
// welcome windows wake up, and sample chat replies in the streaming format.
import { demoResponse, DEMO_WORKSPACE } from '../src/lib/demo/demoApi.js';
import { demoReply } from '../src/lib/demo/demoChat.js';

async function readStream(res) {
  const text = await res.text();
  return text.trim().split('\n').map((line) => JSON.parse(line));
}

describe('try-it board api', () => {
  test('the visitor is signed in', async () => {
    const res = await demoResponse('/api/auth/session');
    expect(res.status).toBe(200);
    expect((await res.json()).authenticated).toBe(true);
  });

  test('the board loads as never stored, so it wakes up', async () => {
    const res = await demoResponse(`/api/client-state/${DEMO_WORKSPACE}`);
    expect(res.status).toBe(404);
    const save = await demoResponse(`/api/client-state/${DEMO_WORKSPACE}`, { method: 'PUT', body: '{}' });
    expect((await save.json()).ok).toBe(true);
  });

  test('chat streams a sample reply that ends in a result', async () => {
    const res = await demoResponse('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'find me customers' }] }),
    });
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const events = await readStream(res);
    const result = events.find((e) => e.type === 'result');
    expect(result.text).toMatch(/LeadHound/);
    expect(events.filter((e) => e.type === 'delta').map((e) => e.text).join('')).toBe(result.text);
  });

  test('the free AI notice stays hidden and unknown calls answer empty', async () => {
    expect(await (await demoResponse('/api/ai/free-tier/status?workspaceId=x')).json()).toEqual({ enabled: false });
    expect(await (await demoResponse('/api/anything')).json()).toEqual({});
    expect((await demoResponse('/api/anything', { method: 'POST' })).status).toBe(200);
  });
});

describe('sample replies', () => {
  test('reads text from content parts and always says how to get real answers', () => {
    const reply = demoReply([{ role: 'user', content: [{ type: 'text', text: 'how do groups work' }] }]);
    expect(reply).toMatch(/group/);
    expect(reply).toMatch(/your own AI key/);
    expect(demoReply([])).toMatch(/sample replies/);
  });
});

describe('ready-made boards on the try-it board', () => {
  test('lists the starter boards and builds one with stand-in agents', async () => {
    const list = await (await demoResponse('/api/board-templates')).json();
    expect(list.templates.map((t) => t.name)).toEqual([
      'Developer', 'Code Workspace', 'Creative Studio', 'Agent Team', 'Small Business', 'Notes Workspace',
    ]);
    const res = await demoResponse(`/api/board-templates/${list.templates[0].id}/apply`, { method: 'POST', body: '{}' });
    const { board } = await res.json();
    expect(board.agents.length).toBeGreaterThan(0);
    expect(board.agents.every((a) => a.id.startsWith('demo-'))).toBe(true);
    expect(board.windows.length).toBeGreaterThan(0);
  });

  test('Real Estate Team is not on the try-it board', async () => {
    expect((await demoResponse('/api/board-templates/real-estate-team/apply', { method: 'POST' })).status).toBe(404);
  });
});
