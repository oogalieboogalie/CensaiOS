import http from 'node:http';
import { describe, expect, test, afterEach } from '@jest/globals';
import { startBoardDoor } from '../server/shareLinks/boardDoor.js';
import {
  boardDoorAllows, boardLink, hostIsReachableByAnyone, originFromRequest, PUBLIC_LINK_FAILED,
} from '../server/shareLinks/boardDoorRules.js';
import { materializeCloudflared } from '../server/shareLinks/cloudflaredBin.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const TOKEN = 'a'.repeat(43);
const doors = [];

afterEach(() => {
  for (const door of doors.splice(0)) door.close();
});

describe('the share link', () => {
  test('is a public guest link for this board', () => {
    const url = boardLink('https://demo.trycloudflare.com', TOKEN);
    expect(url).toBe(`https://demo.trycloudflare.com/?join=${TOKEN}`);
    expect(url).not.toContain('localhost');
    expect(url).not.toContain('invite=');
  });

  test('refuses a localhost address', () => {
    expect(() => boardLink('http://localhost:3012', TOKEN)).toThrow(PUBLIC_LINK_FAILED);
    expect(hostIsReachableByAnyone('localhost:3012')).toBe(false);
    expect(hostIsReachableByAnyone('127.0.0.1:3012')).toBe(false);
    expect(hostIsReachableByAnyone('10.1.2.3')).toBe(false);
    expect(hostIsReachableByAnyone('officepc')).toBe(false);
    expect(hostIsReachableByAnyone('demo.trycloudflare.com')).toBe(true);
    expect(originFromRequest({ headers: { host: 'os.example.com' }, protocol: 'https' })).toBe('https://os.example.com');
    expect(originFromRequest({ headers: { host: 'localhost:3012' } })).toBe('');
  });
});

describe('the board door', () => {
  test('allows the guest board and refuses the rest of the machine', () => {
    expect(boardDoorAllows({ method: 'GET', path: '/', search: `?join=${TOKEN}` })).toBe(true);
    expect(boardDoorAllows({ method: 'GET', path: '/assets/app.js', search: '' })).toBe(true);
    expect(boardDoorAllows({ method: 'GET', path: '/api/guest/links/x', search: '' })).toBe(true);
    expect(boardDoorAllows({ method: 'GET', path: '/hocuspocus', search: '?workspaceId=board&guest=1' })).toBe(true);
    expect(boardDoorAllows({ method: 'GET', path: '/ws/workspace-collaboration', search: '?guest=1&workspaceId=board' })).toBe(true);
    expect(boardDoorAllows({ method: 'GET', path: '/', search: '' })).toBe(false);
    expect(boardDoorAllows({ method: 'GET', path: '/', search: '?invite=' + 'b'.repeat(32) })).toBe(false);
    expect(boardDoorAllows({ method: 'POST', path: '/api/auth/local', search: '' })).toBe(false);
    expect(boardDoorAllows({ method: 'POST', path: '/api/auth/developer', search: '' })).toBe(false);
    expect(boardDoorAllows({ method: 'GET', path: '/api/keys', search: '' })).toBe(false);
    expect(boardDoorAllows({ method: 'GET', path: '/api/vault', search: '' })).toBe(false);
    expect(boardDoorAllows({ method: 'POST', path: '/api/invites/redeem', search: '' })).toBe(false);
    expect(boardDoorAllows({ method: 'GET', path: '/hocuspocus', search: '?workspaceId=board' })).toBe(false);
    expect(boardDoorAllows({ method: 'GET', path: '/api/workspaces', search: `?join=${TOKEN}` })).toBe(false);
  });

  test('proxies only the guest board and keeps the public host', async () => {
    const seen = [];
    const upstream = http.createServer((req, res) => {
      seen.push({ host: req.headers.host, forwarded: req.headers['x-forwarded-for'], path: req.url });
      res.end('board');
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const door = await startBoardDoor({ upstreamPort: upstream.address().port });
    doors.push(door, { close: () => upstream.close() });
    const hit = (path, headers, method = 'GET') => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: door.port, path, method, headers }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      req.end();
    });

    const join = await hit(`/?join=${TOKEN}`, { host: 'demo.trycloudflare.com' });
    expect(join.status).toBe(200);
    expect(join.body).toBe('board');
    expect(seen[0].host).toBe('demo.trycloudflare.com');
    expect(seen[0].forwarded).toBeTruthy();

    const owner = await hit('/api/auth/local', {}, 'POST');
    expect(owner.status).toBe(403);
    expect(owner.body).toBe('This address opens one shared board.');
    expect(seen).toHaveLength(1);

    const rewritten = await hit(`/?join=${TOKEN}`, { host: '127.0.0.1:9', 'x-forwarded-host': 'demo.trycloudflare.com' });
    expect(rewritten.status).toBe(200);
    expect(seen[1].host).toBe('demo.trycloudflare.com');
  });
});

describe('the pinned tunnel binary', () => {
  test('a checksum mismatch is not saved', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'board-door-'));
    const bytes = Buffer.from('not-the-binary');
    await expect(materializeCloudflared({
      dir,
      asset: { name: 'cloudflared', sha256: '0'.repeat(64), archive: false, url: 'https://example.invalid/cloudflared' },
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => Uint8Array.from(bytes).buffer }),
    })).rejects.toMatchObject({ code: 'PUBLIC_LINK_UNAVAILABLE' });
    await expect(readFile(path.join(dir, 'cloudflared'))).rejects.toThrow();
    await rm(dir, { recursive: true });
  });

  test('a matching checksum is the binary the button starts', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'board-door-'));
    const bytes = Buffer.from('cloudflared-stand-in');
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const binary = await materializeCloudflared({
      dir,
      asset: { name: 'cloudflared', sha256, archive: false, url: 'https://example.invalid/cloudflared' },
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => Uint8Array.from(bytes).buffer }),
    });
    expect(await readFile(binary, 'utf8')).toBe('cloudflared-stand-in');
    await rm(dir, { recursive: true });
  });
});
