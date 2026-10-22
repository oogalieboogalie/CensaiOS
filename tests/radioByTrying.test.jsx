/**
 * @jest-environment jsdom
 */
import http from 'node:http';
import { render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MusicWindow } from '../src/components/MusicWindow.jsx';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';

// A stream whose address has none of the known words. The stand-in at
// /abc123 answers audio/mpeg and never sends a length, so the player has to
// learn that it is radio by trying the link.

const made = [];
let server;
let origin;
const sockets = new Set();

// jsdom has no fetch. This reads the stand-in's real headers the same way
// the browser's fetch would, then stops so a live stream does not run on.
function fetchHeaders(url, init = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let settled = false;
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      signal: init.signal,
    }, (incoming) => {
      settled = true;
      resolve({
        ok: incoming.statusCode >= 200 && incoming.statusCode < 300,
        status: incoming.statusCode,
        type: 'basic',
        headers: {
          get(name) {
            const value = incoming.headers[String(name).toLowerCase()];
            if (Array.isArray(value)) return value.join(', ');
            return value ?? null;
          },
        },
        body: {
          cancel() {
            incoming.destroy();
            req.destroy();
            return Promise.resolve();
          },
        },
      });
    });
    req.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
    req.end();
  });
}

beforeAll(async () => {
  window.fetch = fetchHeaders;
  const gradient = { addColorStop: () => {} };
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => gradient : () => {})),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const proto = window.HTMLMediaElement.prototype;
  Object.defineProperty(proto, 'paused', { configurable: true, get() { return !this.isPlaying; } });
  proto.play = function play() { this.isPlaying = true; this.dispatchEvent(new Event('play')); return Promise.resolve(); };
  proto.pause = function pause() { this.isPlaying = false; this.dispatchEvent(new Event('pause')); };
  const RealAudio = window.Audio;
  global.Audio = function Audio() { const a = new RealAudio(); made.push(a); return a; };

  server = http.createServer((req, res) => {
    res.on('error', () => {});
    const path = String(req.url || '').split('?')[0];
    if (path === '/abc123') {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.write(Buffer.alloc(16));
      return;
    }
    const body = '<!doctype html><title>page</title>';
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  if (server) await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => { made.length = 0; window.localStorage.clear(); });

const linkAudio = (url) => made.filter((a) => a.getAttribute('src') === url).pop();

describe('radio found by trying the link', () => {
  test('a plain address that answers audio/mpeg with no length plays with the radio skin', async () => {
    const url = `${origin}/abc123`;
    const win = { id: 'r1', w: 300, h: 460, musicDevice: true, src: url, trackTitle: 'Station' };
    const { container } = render(<MusicWindow win={win} onUpdate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('CensaiRadio')).toBeTruthy());

    expect(container.querySelector('[data-music-device="radio"]')).toBeTruthy();
    expect(container.querySelector('.hb-music-model').textContent).toBe('NET·TUNER');
    expect(container.querySelector('iframe')).toBeNull();
    expect(linkAudio(url).isPlaying).toBe(true);
    const lines = pendingAppLog().filter((e) => e.where === 'music');
    const found = lines.find((e) => e.message === 'music: found a radio link by trying 127.0.0.1');
    expect(found).toMatchObject({ level: 'info', where: 'music' });
    expect(lines.filter((e) => e.message === found.message)).toHaveLength(1);
    expect(lines.map((e) => e.message).join(' ')).not.toContain('abc123');
  });

  test('a page that will not play shows a plain note and frames nothing', async () => {
    const url = `${origin}/about?from=youtube.com`;
    const win = { id: 'r2', w: 300, h: 460, musicDevice: true, src: url, trackTitle: 'Page' };
    const { container } = render(<MusicWindow win={win} onUpdate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('This is a web page, not music. Open it in a Browser window.')).toBeTruthy());
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByText('CensaiRadio')).toBeNull();
    expect(container.querySelector('[data-music-device="radio"]')).toBeNull();
    const lines = pendingAppLog().filter((e) => e.where === 'music').map((e) => e.message);
    expect(lines).toContain('music: refused a web page link from 127.0.0.1');
    expect(lines.some((m) => m.includes('about') || m.includes('from=youtube'))).toBe(false);
  });
});
