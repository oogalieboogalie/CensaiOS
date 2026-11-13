// Opens the public address the share button copies. The tunnel points at
// the board door, which refuses everything except that shared board.
// A configured public domain is used instead. The quick tunnel stays off
// until CENSAI_QUICK_TUNNEL is on, and it closes when the last share link
// is revoked. A new tunnel address replaces the one from before a restart.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { isJestRun } from '../security/testShortcut.js';
import { startBoardDoor } from './boardDoor.js';
import { boardLink, originFromRequest, PUBLIC_LINK_FAILED } from './boardDoorRules.js';
import { cloudflaredAsset, materializeCloudflared } from './cloudflaredBin.js';
import { shareOriginChoice } from './tunnelPolicy.js';

const log = createLogger('board-door');

function latestTunnelUrl(text) {
  return text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)?.at(-1) || '';
}
let opening = null;
let current = null;
let generation = 0;
let addressChanged = false;
const jestMemory = { value: '' };

function failed() {
  const error = new Error(PUBLIC_LINK_FAILED);
  error.statusCode = 503;
  error.code = 'PUBLIC_LINK_UNAVAILABLE';
  return error;
}

function childAlive(child) {
  return Boolean(child) && !child.killed && child.exitCode == null && child.signalCode == null;
}

function originFile() {
  const dir = process.env.HOMEBASE_STATE_DIR || path.join(os.homedir(), '.homebase-state');
  return path.join(dir, 'share-tunnel-origin');
}

function fileStore() {
  return {
    read() {
      try { return fs.readFileSync(originFile(), 'utf8').trim(); } catch { return ''; }
    },
    write(origin) {
      try {
        const file = originFile();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, origin);
      } catch (error) {
        log.warn('public address was not remembered', { code: safeErrorCode(error) });
      }
    },
  };
}

function storeFor(deps, env) {
  if (deps.originStore) return deps.originStore;
  if (isJestRun(env)) return { read: () => jestMemory.value, write: (value) => { jestMemory.value = value; } };
  return fileStore();
}

function rememberOrigin(origin, store) {
  const previous = String(store.read() || '');
  if (previous === origin) return origin;
  store.write(origin);
  if (previous) addressChanged = true;
  return origin;
}

export function takeAddressChanged() {
  const changed = addressChanged;
  addressChanged = false;
  return changed;
}

export function openCloudflaredTunnel({ port, binary, spawnImpl = spawn, onOrigin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(binary, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let text = '';
    let settled = false;
    let announced = '';
    const finish = (error, origin) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        child.kill();
        reject(error);
        return;
      }
      resolve({ origin, child });
    };
    const timer = setTimeout(() => finish(failed()), 25_000);
    const onData = (chunk) => {
      text += chunk.toString();
      if (text.length > 12000) text = text.slice(-6000);
      const found = latestTunnelUrl(text);
      if (!found || found === announced) return;
      announced = found;
      if (!settled) finish(null, found);
      else onOrigin?.(found);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (error) => {
      log.warn('public board address did not start', { code: safeErrorCode(error) });
      finish(failed());
    });
    child.on('exit', () => { if (!settled) finish(failed()); });
  });
}

async function openRealTunnel(port, onOrigin) {
  const dir = path.join(process.env.HOMEBASE_STATE_DIR || path.join(os.homedir(), '.homebase-state'), 'cloudflared', '2026.10.7');
  const binary = await materializeCloudflared({ dir, asset: cloudflaredAsset() });
  return openCloudflaredTunnel({ port, binary, onOrigin });
}

async function openBoardDoorOrigin(upstreamPort, deps) {
  if (current?.origin && childAlive(current.child)) return current.origin;
  if (opening) return opening;
  const env = deps.env || process.env;
  const store = storeFor(deps, env);
  const gen = generation;
  opening = (async () => {
    if (!current?.door) {
      const start = deps.startDoor || startBoardDoor;
      current = { door: await start({ upstreamPort }) };
    }
    if (gen !== generation) throw failed();
    let seen = null;
    const onOrigin = (origin) => {
      if (gen !== generation || !current || current.child !== seen) return;
      current.origin = rememberOrigin(origin, store);
    };
    const tunnel = deps.openTunnel
      ? await deps.openTunnel({ port: current.door.port, onOrigin })
      : await openRealTunnel(current.door.port, onOrigin);
    if (gen !== generation) {
      tunnel.child?.kill?.();
      throw failed();
    }
    seen = tunnel.child;
    const origin = rememberOrigin(tunnel.origin, store);
    const door = current.door;
    current = { origin, door, child: tunnel.child };
    tunnel.child?.on?.('exit', () => {
      if (current?.child === tunnel.child) current = { door };
    });
    return origin;
  })().finally(() => { opening = null; });
  return opening;
}

/** Origin a guest can open. The quick tunnel is opt-in and never replaces a public domain. */
export async function originForShare(req, deps = {}) {
  const env = deps.env || process.env;
  if (deps.force !== true && isJestRun(env)) return originFromRequest(req) || 'https://board.example';
  const choice = shareOriginChoice(req, env);
  if (choice.kind === 'domain') return choice.origin;
  if (choice.kind !== 'tunnel') throw failed();
  const port = Number(req?.socket?.localPort || env.PORT || 3001);
  try {
    return await openBoardDoorOrigin(port, deps);
  } catch (error) {
    if (error?.code === 'PUBLIC_LINK_UNAVAILABLE') throw error;
    log.warn('public board address did not start', { code: safeErrorCode(error) });
    throw failed();
  }
}

export async function publicJoinUrl(req, token) {
  return boardLink(await originForShare(req), token);
}

export function closeBoardTunnel() {
  generation += 1;
  const snapshot = current;
  current = null;
  opening = null;
  try { snapshot?.child?.kill?.(); } catch { /* already gone */ }
  try { snapshot?.door?.close?.(); } catch { /* already gone */ }
}

/** Test hook. */
export function resetBoardTunnel() {
  closeBoardTunnel();
  addressChanged = false;
  jestMemory.value = '';
}
