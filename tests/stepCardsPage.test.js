import http from 'node:http';
import { jest } from '@jest/globals';

const logLines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (name) => ({
    info: (message, meta) => logLines.push({ name, message, meta }),
    warn: () => {}, error: () => {}, debug: () => {},
  }),
}));

const { checkPage, devServerPort } = await import('../server/stepCards/pageCheck.js');
const { verifyStep } = await import('../server/stepCards/verify.js');
const { checkLine, checkWords, parseCheck } = await import('../src/lib/stepCards/todoFile.js');

// A made-up date-badge project's dev server: /api/health says ok, /old moves, /broken fails.
let server;
let port;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/api/health') return res.end(JSON.stringify({ status: 'ok', app: 'date-badge' }));
    if (req.url === '/old') { res.writeHead(302, { location: 'https://example.com/' }); return res.end(); }
    if (req.url === '/broken') { res.writeHead(500); return res.end('Pat broke it'); }
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<h1>Date badge</h1>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = String(server.address().port);
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => { logLines.length = 0; });

const allowed = () => true;
const page = (line) => parseCheck(line);

describe('page checks in a .todo file', () => {
  test('read and write the page line', () => {
    expect(parseCheck('page /api/health says "ok"')).toEqual({ kind: 'page', host: '', port: '', path: '/api/health', says: 'ok' });
    expect(parseCheck('page http://localhost:5173/about')).toEqual({ kind: 'page', host: 'localhost', port: '5173', path: '/about' });
    expect(checkLine(parseCheck('page :5173/about says "Hi Sam"'))).toBe('page :5173/about says "Hi Sam"');
    expect(checkWords(parseCheck('page /api/health says "ok"'))).toBe('the page /api/health says "ok"');
    expect(parseCheck('page :0/')).toBeNull();
    expect(parseCheck('page /two words')).toBeNull();
  });

  test('the dev server port comes from the project', async () => {
    const read = (scripts) => async () => JSON.stringify({ scripts });
    expect(await devServerPort('/p', { readFile: read({ dev: 'vite' }) })).toBe('5173');
    expect(await devServerPort('/p', { readFile: read({ dev: 'vite --port 4321' }) })).toBe('4321');
    expect(await devServerPort('/p', { readFile: read({ start: 'next start -p 3100' }) })).toBe('3100');
    expect(await devServerPort('/p', { readFile: async () => { throw new Error('none'); } })).toBe('3000');
  });
});

describe('checking a page', () => {
  test('turns green when the running app says the words', async () => {
    const r = await checkPage(null, page(`page :${port}/api/health says "ok"`), { allowed });
    expect(r).toEqual({ ok: true, line: `:${port}/api/health says "ok".` });
    expect(logLines).toEqual([{ name: 'step-cards', message: 'page check', meta: { path: '/api', status: 200, worked: true, why: 'answered with the words' } }]);
  });

  test('a bare path asks the project\'s own dev server port', async () => {
    const readFile = async () => JSON.stringify({ scripts: { dev: `vite --port ${port}` } });
    const r = await checkPage('/projects/date-badge', page('page /'), { allowed, readFile });
    expect(r.ok).toBe(true);
  });

  test('says it could not reach the page when the app is off', async () => {
    const off = http.createServer();
    await new Promise((resolve) => off.listen(0, '127.0.0.1', resolve));
    const offPort = off.address().port;
    await new Promise((resolve) => off.close(resolve));
    const r = await checkPage(null, page(`page :${offPort}/api/health says "ok"`), { allowed });
    expect(r.ok).toBe(false);
    expect(r.line).toBe(`I could not reach the page at localhost:${offPort}/api/health. Start the project's app (for example npm run dev), then check again.`);
    expect(logLines[0].meta).toEqual({ path: '/api', status: null, worked: false, why: 'not reached' });
  });

  test('refuses an outside address without asking it', async () => {
    const fetchAt = jest.fn();
    const r = await checkPage(null, page('page https://example.com/admin'), { allowed, fetchAt });
    expect(r).toEqual({ ok: null, line: 'I only check pages of the project\'s own app on this computer (localhost), so I did not ask example.com.' });
    expect(fetchAt).not.toHaveBeenCalled();
    expect(logLines[0].meta.why).toBe('not this computer');
  });

  test('never asks censaiOS itself, and stays off where the app may not call this computer', async () => {
    const fetchAt = jest.fn();
    expect((await checkPage(null, page('page :3001/api/keys'), { allowed, fetchAt })).ok).toBeNull();
    expect((await checkPage(null, page(`page :${port}/`), { allowed: () => false, fetchAt })).ok).toBeNull();
    expect(fetchAt).not.toHaveBeenCalled();
  });

  test('a redirect, an error or missing words is not green, and the page text never reaches the log', async () => {
    expect((await checkPage(null, page(`page :${port}/old`), { allowed })).line).toBe(`:${port}/old sent me somewhere else (302), so it is not the page itself.`);
    expect((await checkPage(null, page(`page :${port}/broken`), { allowed })).line).toBe(`:${port}/broken answered with an error (500).`);
    expect((await checkPage(null, page(`page :${port}/api/health?token=x says "Sam"`), { allowed })).ok).toBe(false);
    const logged = JSON.stringify(logLines);
    expect(logged).not.toMatch(/Pat broke it|date-badge|token=x/);
  });
});

describe('page checks inside a step', () => {
  const step = { title: 'Health page answers' };
  test('only the owner can check pages', async () => {
    const checks = [{ id: 'c1', ...page(`page :${port}/api/health says "ok"`) }];
    const asSam = await verifyStep({ step, checks, ctx: { cwd: null, isOwner: async () => false }, deps: { allowed } });
    expect(asSam).toEqual([{ id: 'c1', ok: null, line: 'Only this computer\'s owner can check pages of the project\'s app.' }]);
    const asPat = await verifyStep({ step, checks, ctx: { cwd: null, isOwner: async () => true }, deps: { allowed } });
    expect(asPat[0].ok).toBe(true);
  });
});
