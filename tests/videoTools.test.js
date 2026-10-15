import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Video tool family: make_video starts a Google Veo clip on the person's own
// Google key, video_status collects it and keeps the mp4 for the board.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'videos-'));
process.env.VIDEO_STATE_DIR = tmp;

jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig: jest.fn(async (userId, provider) => (userId === 7 && provider === 'google' ? { apiKey: 'user-google-key' } : null)),
}));

const veo = await import('../server/video/veo.js');
const { startVideo, collectVideo } = await import('../server/video/service.js');
const { handleVideoTool } = await import('../server/tools/handlers/video.js');
const { videoTools } = await import('../server/tools/definitions/video.js');
const { TOOL_DEFINITIONS, listToolCatalog } = await import('../server/tools/definitions.js');
const { TOOL_REGISTRY } = await import('../server/tools/handlers/index.js');

function json(body, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => 'video/mp4' } };
}

function fakeVeo({ polls = 1 } = {}) {
  let checks = 0;
  const calls = [];
  const fetchImpl = jest.fn(async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith(':predictLongRunning')) return json({ name: 'models/veo-3.0-generate-001/operations/op123' });
    if (String(url).includes('/operations/op123')) {
      checks += 1;
      if (checks <= polls) return json({ name: 'op123', done: false });
      return json({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media' } }] } } });
    }
    if (String(url).includes('files/abc')) return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('MP4DATA'), headers: { get: () => 'video/mp4' } };
    return json({}, 404);
  });
  return { fetchImpl, calls };
}

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the tools are registered, catalogued as Video, and have handlers', () => {
  for (const tool of videoTools) {
    expect(TOOL_DEFINITIONS.some(t => t.function.name === tool.function.name)).toBe(true);
    expect(typeof TOOL_REGISTRY[tool.function.name]).toBe('function');
  }
  const video = listToolCatalog().categories.find(c => c.label === 'Video');
  expect(video.tools.map(t => t.name).sort()).toEqual(['make_video', 'video_status']);
});

test('Veo start sends the prompt with the key in a header, never the URL', async () => {
  const { fetchImpl, calls } = fakeVeo();
  const out = await veo.startVeoJob({ apiKey: 'k1', prompt: 'a red kite over a beach', aspectRatio: '9:16', fetchImpl });
  expect(out).toEqual({ operation: 'models/veo-3.0-generate-001/operations/op123', model: 'veo-3.0-generate-001' });
  expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-generate-001:predictLongRunning');
  expect(calls[0].url).not.toContain('k1');
  expect(calls[0].init.headers['x-goog-api-key']).toBe('k1');
  expect(JSON.parse(calls[0].init.body)).toEqual({ instances: [{ prompt: 'a red kite over a beach' }], parameters: { aspectRatio: '9:16' } });
});

test('refuses empty prompts, odd job ids and links outside Google', async () => {
  await expect(veo.startVeoJob({ apiKey: 'k', prompt: ' ' })).rejects.toMatchObject({ code: 'VIDEO_EMPTY' });
  await expect(veo.startVeoJob({ apiKey: '', prompt: 'x' })).rejects.toMatchObject({ code: 'VIDEO_KEY_REQUIRED' });
  await expect(veo.checkVeoJob({ apiKey: 'k', operation: '../../evil' })).rejects.toMatchObject({ code: 'VIDEO_BAD_JOB' });
  await expect(veo.downloadVeoVideo({ apiKey: 'k', uri: 'https://evil.example.com/v.mp4' })).rejects.toMatchObject({ code: 'VIDEO_BAD_LINK' });
});

test('a 403 from Google says to check the key in the vault', async () => {
  const fetchImpl = jest.fn(async () => json({ error: 'nope' }, 403));
  await expect(veo.startVeoJob({ apiKey: 'k', prompt: 'x', fetchImpl })).rejects.toThrow(/Settings → Vault/);
});

test('start and collect: uses the vault key, keeps the mp4, only the owner can see it', async () => {
  const { fetchImpl, calls } = fakeVeo({ polls: 1 });
  const job = await startVideo({ prompt: 'a lighthouse at dusk', userId: 7, workspaceId: 'w1', agentId: 'atlas' }, { fetchImpl });
  expect(job).toMatchObject({ status: 'working', agentId: 'atlas', workspaceId: 'w1' });
  expect(JSON.stringify(job)).not.toContain('user-google-key');
  expect(calls[0].init.headers['x-goog-api-key']).toBe('user-google-key');

  expect((await collectVideo({ id: job.id, userId: 7, workspaceId: 'w1' }, { fetchImpl })).status).toBe('working');
  const ready = await collectVideo({ id: job.id, userId: 7, workspaceId: 'w1' }, { fetchImpl });
  expect(ready).toMatchObject({ status: 'ready', url: `/api/videos/${job.id}/file` });
  expect(fs.readFileSync(path.join(tmp, `${job.id}.mp4`), 'utf8')).toBe('MP4DATA');
  expect(fs.readFileSync(path.join(tmp, 'jobs.json'), 'utf8')).not.toContain('user-google-key');

  await expect(collectVideo({ id: job.id, userId: 8, workspaceId: 'w1' }, { fetchImpl })).rejects.toMatchObject({ code: 'VIDEO_NOT_FOUND' });
});

test('hosted users without their own Google key are asked for one; the server key is not spent', async () => {
  const prev = process.env.CENSAI_MODE;
  process.env.CENSAI_MODE = 'cloud_saas';
  try {
    const out = JSON.parse(await handleVideoTool('atlas', 'make_video', { prompt: 'x' }, { userId: 9, workspaceId: 'w' }, { serverKey: 'server-key', fetchImpl: fakeVeo().fetchImpl }));
    expect(out).toMatchObject({ code: 'VIDEO_KEY_REQUIRED' });
  } finally {
    if (prev === undefined) delete process.env.CENSAI_MODE; else process.env.CENSAI_MODE = prev;
  }
});

test('on a local install a teammate cannot spend the owner\'s Google key for video; the owner can', async () => {
  const teammate = JSON.parse(await handleVideoTool('atlas', 'make_video', { prompt: 'x' }, { userId: 9, workspaceId: 'w', userRole: 'user' }, { serverKey: 'owner-env-key', fetchImpl: fakeVeo().fetchImpl }));
  expect(teammate).toMatchObject({ code: 'VIDEO_KEY_REQUIRED' });

  const { fetchImpl, calls } = fakeVeo();
  const owner = JSON.parse(await handleVideoTool('atlas', 'make_video', { prompt: 'x' }, { userId: 1, workspaceId: 'w', userRole: 'admin' }, { serverKey: 'owner-env-key', fetchImpl }));
  expect(owner).toMatchObject({ status: 'working' });
  expect(JSON.stringify(calls[0].init)).toContain('owner-env-key');
});

test('agent flow through the tool handler: make_video then video_status returns a link', async () => {
  const { fetchImpl } = fakeVeo({ polls: 1 });
  const started = JSON.parse(await handleVideoTool('atlas', 'make_video', { prompt: 'a cat surfing', aspect_ratio: '16:9' }, { userId: 7, workspaceId: 'w2' }, { fetchImpl }));
  expect(started).toMatchObject({ status: 'working' });
  const done = JSON.parse(await handleVideoTool('atlas', 'video_status', { video_id: started.video_id, wait_seconds: 30 }, { userId: 7, workspaceId: 'w2' }, { fetchImpl, intervalMs: 1, sleep: async () => {} }));
  expect(done).toMatchObject({ status: 'ready', markdown: `[Watch the video](/api/videos/${started.video_id}/file)` });
});
