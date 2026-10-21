// Step cards: a "page" check asks the project's own app, running on this
// computer, for one page, and turns green only on a real answer (a 2xx, with
// the words it was told to look for when given). It only ever connects to
// this computer's loopback address (127.0.0.1, then ::1), never follows a
// redirect, never asks censaiOS's own server, and only runs where the guards
// in server/security/publicAddress.js let the app call this computer.
// One 'step-cards' log line per check: the path (no query), the status code
// and whether it worked or why not. Never the page's text.

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createLogger } from '../logger.js';
import { pageAddress } from '../../src/lib/stepCards/todoFile.js';
import { privateAddressesAllowed } from '../security/publicAddress.js';

const log = createLogger('step-cards');
const LOOPBACK = new Set(['', 'localhost', '127.0.0.1', '[::1]', '::1']);
const ADDRESSES = ['127.0.0.1', '::1'];
const MAX_BODY = 512 * 1024;
export const PAGE_TIMEOUT_MS = 10_000;
const clip = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** censaiOS's own server port: a page check never asks it. */
export function ownPort() {
  return String(Number(process.env.PORT) || 3001);
}

/** The project's dev server port from its package.json (an explicit port, else Vite's 5173, else 3000). */
export async function devServerPort(cwd, { readFile = fs.readFile } = {}) {
  let scripts = {};
  try {
    scripts = JSON.parse(String(await readFile(path.join(cwd, 'package.json'), 'utf8'))).scripts || {};
  } catch { /* no package.json: fall through to the usual default */ }
  const dev = String(scripts.dev || scripts.start || '');
  const explicit = /(?:--port[ =]|-p\s+|PORT=)(\d{2,5})\b/.exec(dev);
  if (explicit) return explicit[1];
  return /\bvite\b/.test(dev) ? '5173' : '3000';
}

/**
 * GET one page from a loopback address (an IP, so there is no name to look up),
 * with the Host header the dev server expects. Never follows a redirect.
 * Resolves { status, read() -> text up to MAX_BODY, discard() }.
 */
function defaultFetch(address, url) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: address,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: { host: target.host, accept: 'text/html, application/json, text/plain, */*' },
      agent: false,
      timeout: PAGE_TIMEOUT_MS,
    }, (response) => resolve({
      status: response.statusCode || 0,
      discard: () => response.destroy(),
      read: () => new Promise((done) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          chunks.push(chunk);
          size += chunk.length;
          if (size >= MAX_BODY) response.destroy();
        });
        response.on('close', () => done(Buffer.concat(chunks).toString('utf8')));
      }),
    }));
    request.on('timeout', () => request.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
    request.on('error', reject);
    request.end();
  });
}

// Only the path's first part (/api of /api/health?x) reaches the log: the
// rest is whatever the card's author typed.
function firstSegment(path) {
  const first = String(path || '/').split(/[?#]/)[0].split('/').filter(Boolean)[0];
  return first ? `/${clip(first, 40)}` : '/';
}

function logged(check, result, status, why) {
  log.info('page check', { path: firstSegment(check.path), status: status || null, worked: result.ok === true, why });
  return result;
}

/** Check one page. cwd finds the dev server port when the check names none. */
export async function checkPage(cwd, check, { fetchAt = defaultFetch, readFile = fs.readFile, allowed = privateAddressesAllowed } = {}) {
  const shown = pageAddress(check);
  if (!LOOPBACK.has(String(check.host || '').toLowerCase())) {
    return logged(check, { ok: null, line: `I only check pages of the project's own app on this computer (localhost), so I did not ask ${clip(check.host, 60)}.` }, 0, 'not this computer');
  }
  if (!allowed()) return logged(check, { ok: null, line: 'This censaiOS cannot call this computer, so I could not check the page.' }, 0, 'turned off');
  const port = check.port || (cwd ? await devServerPort(cwd, { readFile }) : '');
  if (!port) return logged(check, { ok: null, line: 'Open the project this card is about first, so I know which port its app runs on.' }, 0, 'no project');
  if (port === ownPort()) return logged(check, { ok: null, line: `Port ${port} is censaiOS itself, not the project's app, so I did not ask it.` }, 0, 'censaiOS port');
  const url = `http://localhost:${port}${check.path || '/'}`;
  let response = null;
  let lastError = null;
  for (const address of ADDRESSES) {
    try {
      response = await fetchAt(address, url);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!response) {
    const timedOut = /timeout|abort/i.test(`${lastError?.name} ${lastError?.message}`);
    return logged(check, {
      ok: false,
      line: timedOut
        ? `The page at localhost:${port}${check.path} did not answer within ${PAGE_TIMEOUT_MS / 1000} seconds.`
        : `I could not reach the page at localhost:${port}${check.path}. Start the project's app (for example npm run dev), then check again.`,
    }, 0, timedOut ? 'timed out' : 'not reached');
  }
  const status = response.status;
  if (status >= 300 && status < 400) {
    response.discard();
    return logged(check, { ok: false, line: `${shown} sent me somewhere else (${status}), so it is not the page itself.` }, status, 'redirect');
  }
  if (status < 200 || status >= 300) {
    response.discard();
    return logged(check, { ok: false, line: `${shown} answered with an error (${status}).` }, status, 'error status');
  }
  if (!check.says) {
    response.discard();
    return logged(check, { ok: true, line: `${shown} answered (${status}).` }, status, 'answered');
  }
  const text = await response.read();
  return text.includes(check.says)
    ? logged(check, { ok: true, line: `${shown} says "${clip(check.says, 80)}".` }, status, 'answered with the words')
    : logged(check, { ok: false, line: `${shown} answered but does not say "${clip(check.says, 80)}".` }, status, 'words missing');
}
