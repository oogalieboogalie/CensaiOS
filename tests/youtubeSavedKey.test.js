// YouTube search reads the vault first and the setup file second. The
// stand-in answer never leaves this process: the outbound guard is the
// mocked vetHost/netFetch pair, so no call reaches YouTube.
import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const QUERY = 'desk-hour';
const VAULT_KEY = 'vault-youtube-key-example';
const SETUP_KEY = 'setup-youtube-key-example';
const CLOUD_KEY = 'cloud-youtube-key-example';

const STANDIN = {
  items: [{
    id: { videoId: 'PatExample1' },
    snippet: {
      title: 'Desk hour',
      channelTitle: 'Pat Example',
      description: 'A made-up video',
      thumbnails: { medium: { url: 'https://example.test/thumb.jpg' } },
      publishedAt: '2020-01-01T00:00:00Z',
    },
  }],
  pageInfo: { totalResults: 1, resultsPerPage: 1 },
};

const calls = [];
const logs = [];
const rows = new Map();
const mockPool = { query: jest.fn() };
const vetHost = jest.fn();
const netFetch = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));
jest.unstable_mockModule('../server/security/publicAddress.js', () => ({ vetHost, netFetch }));

const { youtubeRouter } = await import('../server/youtube.js');
const { keysRouter } = await import('../server/routes/keys.js');
const { onLogRecord } = await import('../server/logger.js');
const { resolveYouTubeKey, getYouTubeApiKey } = await import('../server/googleKeys.js');

const ENV = ['YOUTUBE_API_KEY', 'GOOGLE_CLOUD_API_KEY'];
let savedEnv;
let stopLog;

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  server.use('/api/youtube', youtubeRouter);
  server.use('/api', keysRouter);
  return server;
}

function sentKey(url) {
  return new URL(url).searchParams.get('key');
}

function searchLogs() {
  return logs.filter((record) => record.namespace === 'youtube' && record.message === 'search');
}

beforeAll(() => {
  stopLog = onLogRecord((record) => { logs.push(record); });
});

afterAll(() => { stopLog?.(); });

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV.map((name) => [name, process.env[name]]));
  for (const name of ENV) delete process.env[name];
  calls.length = 0;
  logs.length = 0;
  rows.clear();
  vetHost.mockImplementation(async () => ({ addresses: ['142.250.190.14'], blocked: null }));
  netFetch.mockImplementation(async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => STANDIN };
  });
  mockPool.query.mockImplementation(async (sql, params = []) => {
    if (/INSERT INTO user_api_keys/i.test(sql)) {
      rows.set(`${params[0]}:${params[1]}`, { api_key_encrypted: params[2], base_url: params[3], model_name: params[4] });
      return { rows: [], rowCount: 1 };
    }
    if (/DELETE FROM user_api_keys/i.test(sql)) {
      const found = rows.delete(`${params[0]}:${params[1]}`);
      return { rows: [], rowCount: found ? 1 : 0 };
    }
    if (/FROM user_api_keys/i.test(sql)) {
      const row = rows.get(`${params[0]}:${params[1]}`);
      return { rows: row ? [row] : [] };
    }
    if (/FROM users/i.test(sql)) return { rows: [{ role: 'admin' }] };
    return { rows: [] };
  });
});

afterEach(() => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('YouTube saved key', () => {
  test('with no setup-file key, search returns needs a key', async () => {
    const res = await request(app()).get('/api/youtube/search?q=desk-hour&from=stream');
    expect(res.status).toBe(424);
    expect(res.body.error).toMatch(/needs a key/);
    expect(res.body.code).toBe('YOUTUBE_KEY_REQUIRED');
    expect(res.body.error).not.toMatch(/\.env|YOUTUBE_API_KEY|GOOGLE_CLOUD_API_KEY/);
    expect(calls).toEqual([]);
    expect(searchLogs()[0].meta).toEqual({ window: 'Stream Viewer', source: 'none', worked: false, why: 'needs a key' });
    expect(JSON.stringify(logs)).not.toContain(QUERY);
  });

  test('after saving one in the vault, Stream Viewer, Shorts and Music Player use that key', async () => {
    const saved = await request(app()).post('/api/keys').send({ provider: 'youtube', apiKey: VAULT_KEY });
    expect(saved.status).toBe(201);
    process.env.YOUTUBE_API_KEY = SETUP_KEY;

    const status = await request(app()).get('/api/youtube/key');
    expect(status.body).toEqual({ configured: true, source: 'saved key' });
    expect(JSON.stringify(status.body)).not.toContain(VAULT_KEY);

    const windows = [
      ['stream', 'Stream Viewer', ''],
      ['shorts', 'Shorts', '&shorts=1'],
      ['music', 'Music Player', ''],
    ];
    for (const [from, , extra] of windows) {
      const res = await request(app()).get(`/api/youtube/search?q=${QUERY}&from=${from}${extra}`);
      expect(res.status).toBe(200);
      expect(res.body.items[0]).toMatchObject({
        id: 'PatExample1',
        title: 'Desk hour',
        channelTitle: 'Pat Example',
        url: 'https://www.youtube.com/watch?v=PatExample1',
        embedUrl: 'https://www.youtube.com/embed/PatExample1?autoplay=1',
      });
      expect(JSON.stringify(res.body)).not.toContain(VAULT_KEY);
    }

    expect(calls).toHaveLength(3);
    expect(calls.map(sentKey)).toEqual([VAULT_KEY, VAULT_KEY, VAULT_KEY]);
    expect(new URL(calls[1]).searchParams.get('videoDuration')).toBe('short');
    expect(new URL(calls[0]).searchParams.get('videoDuration')).toBeNull();
    expect(calls.map(sentKey)).not.toContain(SETUP_KEY);
    expect(vetHost).toHaveBeenCalledWith('www.googleapis.com', {});
    expect(searchLogs().map((record) => record.meta)).toEqual([
      { window: 'Stream Viewer', source: 'saved key', worked: true },
      { window: 'Shorts', source: 'saved key', worked: true },
      { window: 'Music Player', source: 'saved key', worked: true },
    ]);
    const dumped = JSON.stringify(logs);
    expect(dumped).not.toContain(QUERY);
    expect(dumped).not.toContain(VAULT_KEY);
    expect(dumped).not.toContain(SETUP_KEY);
  });

  test('with no saved key, search uses the setup file and prefers YOUTUBE_API_KEY', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = CLOUD_KEY;
    process.env.YOUTUBE_API_KEY = SETUP_KEY;
    expect(getYouTubeApiKey()).toBe(SETUP_KEY);

    const res = await request(app()).get(`/api/youtube/search?q=${QUERY}&from=stream`);
    expect(res.status).toBe(200);
    expect(sentKey(calls[0])).toBe(SETUP_KEY);
    expect(searchLogs()[0].meta).toEqual({ window: 'Stream Viewer', source: 'setup file', worked: true });

    delete process.env.YOUTUBE_API_KEY;
    calls.length = 0;
    logs.length = 0;
    const cloud = await request(app()).get(`/api/youtube/search?q=${QUERY}&from=music`);
    expect(cloud.status).toBe(200);
    expect(sentKey(calls[0])).toBe(CLOUD_KEY);
    expect(searchLogs()[0].meta).toMatchObject({ window: 'Music Player', source: 'setup file', worked: true });
  });

  test('a vault read failure falls through to the setup file', async () => {
    process.env.YOUTUBE_API_KEY = SETUP_KEY;
    const key = await resolveYouTubeKey(7, { loadUserKey: async () => { throw new Error('db down'); } });
    expect(key).toEqual({ apiKey: SETUP_KEY, source: 'setup file' });
    const saved = await resolveYouTubeKey(7, {
      loadUserKey: async () => ({ apiKey: VAULT_KEY }),
      setupKey: () => SETUP_KEY,
    });
    expect(saved).toEqual({ apiKey: VAULT_KEY, source: 'saved key' });
    const borrowed = await resolveYouTubeKey(7, {
      loadUserKey: async () => ({ apiKey: SETUP_KEY, source: 'env' }),
      setupKey: () => SETUP_KEY,
    });
    expect(borrowed).toEqual({ apiKey: SETUP_KEY, source: 'setup file' });
  });

  test('a private address is refused before any call', async () => {
    process.env.YOUTUBE_API_KEY = SETUP_KEY;
    vetHost.mockImplementation(async () => ({ addresses: ['127.0.0.1'], blocked: '127.0.0.1' }));
    const res = await request(app()).get(`/api/youtube/search?q=${QUERY}&from=stream`);
    expect(res.status).toBe(502);
    expect(calls).toEqual([]);
    expect(searchLogs()[0].meta).toEqual({
      window: 'Stream Viewer', source: 'setup file', worked: false, why: 'private address',
    });
    expect(JSON.stringify(res.body)).not.toContain(SETUP_KEY);
  });
  test('a teammate without the owner say-so never borrows the setup-file key', async () => {
    const key = await resolveYouTubeKey(9, {
      loadUserKey: async () => null,
      setupKey: () => SETUP_KEY,
      mayUse: async () => false,
    });
    expect(key).toEqual({ apiKey: '', source: null });
    expect(JSON.stringify(logs)).not.toContain(SETUP_KEY);
  });

  test('a used-up daily quota is not mistaken for a bad key', async () => {
    process.env.YOUTUBE_API_KEY = SETUP_KEY;
    netFetch.mockImplementation(async () => ({
      ok: false, status: 403, text: async () => '{"error":{"errors":[{"reason":"quotaExceeded"}]}}',
    }));
    const res = await request(app()).get(`/api/youtube/search?q=${QUERY}&from=music`);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('YOUTUBE_QUOTA_USED');
    expect(searchLogs()[0].meta).toMatchObject({ worked: false, why: 'quota used up' });
  });
});
