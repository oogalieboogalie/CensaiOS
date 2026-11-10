// Pinned cloudflared quick-tunnel binary. The share button starts it; the
// owner does not download or type anything. The checksum is the release's.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { PUBLIC_LINK_FAILED } from './boardDoorRules.js';

const VERSION = '2026.10.7';
const BASE = `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}`;

const ASSETS = {
  'linux/x64': ['cloudflared-linux-amd64', '1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872', false],
  'linux/arm64': ['cloudflared-linux-arm64', '3df43aedc9ff291d1735b5cb576cb97e0b157488796db2e32b28aecabb445775', false],
  'darwin/x64': ['cloudflared-darwin-amd64.tgz', '5c55e77da7012cebca19170357e196176c48c9647cc2ead404702fa125ddbd86', true],
  'darwin/arm64': ['cloudflared-darwin-arm64.tgz', '2136431d5eb467bf447d2ee514b713e192719b143aec1d9e09bf7dc290d5bb12', true],
  'win32/x64': ['cloudflared-windows-amd64.exe', '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343', false],
};

export function cloudflaredAsset(platform = process.platform, arch = process.arch) {
  const row = ASSETS[`${platform}/${arch}`];
  if (!row) return null;
  const [name, sha256, archive] = row;
  return { name, sha256, archive, url: `${BASE}/${name}` };
}

function failed(message = PUBLIC_LINK_FAILED) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = 'PUBLIC_LINK_UNAVAILABLE';
  return error;
}

function unpack(archive, dir) {
  return new Promise((resolve, reject) => {
    execFile('tar', ['-xzf', archive, '-C', dir], (error) => (error ? reject(failed()) : resolve()));
  });
}

/** Download the pinned binary into dir, or return the copy already there. */
export async function materializeCloudflared({
  dir,
  asset = cloudflaredAsset(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!asset) throw failed();
  const binaryName = asset.archive ? 'cloudflared' : (asset.name.endsWith('.exe') ? 'cloudflared.exe' : 'cloudflared');
  const binary = path.join(dir, binaryName);
  if (fs.existsSync(binary)) return binary;
  fs.mkdirSync(dir, { recursive: true });
  const response = await fetchImpl(asset.url, { signal: AbortSignal.timeout(60_000) });
  if (!response?.ok) throw failed();
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (hash !== asset.sha256) throw failed();
  if (!asset.archive) {
    fs.writeFileSync(binary, bytes, { mode: 0o755 });
    return binary;
  }
  const archive = path.join(dir, asset.name);
  fs.writeFileSync(archive, bytes);
  await unpack(archive, dir);
  if (!fs.existsSync(binary)) throw failed();
  fs.chmodSync(binary, 0o755);
  return binary;
}
