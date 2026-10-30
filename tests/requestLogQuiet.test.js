import express from 'express';
import request from 'supertest';
import { createLogger } from '../server/logger.js';
import { requestLogger } from '../server/boot/requestLog.js';
import { clearLines, recentLines, watchServerLog } from '../server/selfFix/logTail.js';

// What the app asks over and over by itself (every few seconds a Files
// window's open folders and its project's versions, its saved state, restart
// notices) is logged below info when answered, also from a router mounted on
// /api as the real ones are; a person opening a folder or saving, and
// anything refused or failing, still is. All paths are made up.

/** The log's lines without how long each took. */
const untimed = (lines) => lines.map((line) => line.replace(/ \d+ms$/, ''));

function appWithLog() {
  const lines = [];
  const log = Object.fromEntries(['error', 'warn', 'info', 'debug'].map((level) => [level, (line) => lines.push(`${level} ${line}`)]));
  const app = express();
  app.use(requestLogger(log));
  const answer = (req, res) => {
    if (req.query.path === '/made-up-gone') return res.status(404).json({ error: 'gone' });
    if (req.query.path === '/made-up-broken') return res.status(500).json({ error: 'broken' });
    return res.json({ children: [] });
  };
  const files = express.Router();
  files.get('/files/browse', answer);
  files.get('/files/relist', answer);
  files.get('/client-state/:key', answer);
  files.put('/client-state/:key', answer);
  files.get('/local-dev-restarts/notifications', answer);
  const versions = express.Router();
  versions.get('/status', answer);
  app.use('/api', files);
  app.use('/api/project-git', versions);
  app.get('/api/health', answer);
  return { app, lines };
}

test('answered requests the app repeats by itself are logged below info', async () => {
  const { app, lines } = appWithLog();
  await request(app).get('/api/files/relist?path=%2Fmade-up-project');
  await request(app).get('/api/project-git/status?path=%2Fmade-up-project');
  await request(app).get('/api/client-state/made-up-key');
  await request(app).get('/api/local-dev-restarts/notifications');
  await request(app).get('/api/health');
  expect(untimed(lines)).toEqual([
    'debug GET /api/files/relist?path=[redacted] 200',
    'debug GET /api/project-git/status?path=[redacted] 200',
    'debug GET /api/client-state/made-up-key 200',
    'debug GET /api/local-dev-restarts/notifications 200',
    'debug GET /api/health 200',
  ]);
});

test('a person opening a folder, or the board saving its state, is logged at info', async () => {
  const { app, lines } = appWithLog();
  await request(app).get('/api/files/browse?path=%2Fmade-up-project');
  await request(app).put('/api/client-state/made-up-key').send({ value: {} });
  expect(untimed(lines)).toEqual([
    'info GET /api/files/browse?path=[redacted] 200',
    'info PUT /api/client-state/made-up-key 200',
  ]);
});

test('a refused or failing answer is logged as it always was, repeated or not', async () => {
  const { app, lines } = appWithLog();
  await request(app).get('/api/files/relist?path=%2Fmade-up-gone');
  await request(app).get('/api/files/relist?path=%2Fmade-up-broken');
  expect(untimed(lines)).toEqual([
    'warn GET /api/files/relist?path=[redacted] 404',
    'error GET /api/files/relist?path=[redacted] 500',
  ]);
});

test("the tail kept for error reports leaves the app's own answered asks out", async () => {
  clearLines();
  const stop = watchServerLog(() => {});
  try {
    const app = express();
    app.use(requestLogger(createLogger('http')));
    app.get('/api/files/relist', (_req, res) => res.json({ children: [] }));
    app.get('/api/files/browse', (_req, res) => res.json({ children: [] }));
    for (let i = 0; i < 5; i += 1) await request(app).get('/api/files/relist?path=%2Fmade-up-project');
    await request(app).get('/api/files/browse?path=%2Fmade-up-project');
    createLogger('made-up-area').debug('a made-up step');
    const tail = recentLines();
    expect(tail.some((line) => line.includes('/api/files/relist'))).toBe(false);
    expect(tail.filter((line) => line.includes('GET /api/files/browse')).length).toBe(1);
    expect(tail.some((line) => line.includes('a made-up step'))).toBe(true);
  } finally {
    stop();
    clearLines();
  }
});
