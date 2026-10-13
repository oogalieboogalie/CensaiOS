import fs from 'fs';
import os from 'os';
import { docker, DockerInputError } from '../docker/cli.js';

// The Docker engine mounts folders by ITS idea of a path. When Homebase runs
// as a plain process that is the folder path itself. When Homebase runs in
// the Docker stack (Alex's PC), a Windows path like D:\Sites\shop has to be
// handed to Docker Desktop's engine in its own form, and a path Homebase sees
// inside its container (/workspace/CensaiHub) has to go back to the real
// folder on the PC. This file does that translation.

const WINDOWS_PATH = /^[A-Za-z]:[\\/]/;
const DESKTOP_HOST_ROOT = '/run/desktop/mnt/host/';

export function cleanFolderPath(input) {
  const raw = String(input ?? '').trim().replace(/^"(.*)"$/, '$1');
  if (!raw) throw new DockerInputError('Pick the project folder first.');
  if (raw.length > 400 || /[\0\r\n",]/.test(raw)) {
    throw new DockerInputError('That folder path has characters Docker cannot mount (quotes, commas or line breaks).');
  }
  if (WINDOWS_PATH.test(raw)) return raw.length > 3 ? raw.replace(/[\\/]+$/, '') : raw;
  if (raw.startsWith('/')) return raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  throw new DockerInputError('Type the full folder path, like D:\\Projects\\my-site.');
}

/** D:\Projects\site -> /run/desktop/mnt/host/d/Projects/site */
export function windowsToDesktopEngine(winPath) {
  const drive = winPath[0].toLowerCase();
  const rest = winPath.slice(2).replace(/\\/g, '/').replace(/^\/+/, '');
  return `${DESKTOP_HOST_ROOT}${drive}${rest ? `/${rest}` : ''}`;
}

let selfMountsCache = null;
async function readSelfMounts() {
  if (selfMountsCache) return selfMountsCache;
  try {
    const { stdout } = await docker(['inspect', '--format', '{{json .Mounts}}', os.hostname()], { timeout: 10_000 });
    selfMountsCache = (JSON.parse(stdout.trim() || '[]') || [])
      .filter((m) => m?.Type === 'bind' && m.Source && m.Destination)
      .map((m) => ({ source: m.Source, destination: m.Destination }));
  } catch {
    selfMountsCache = [];
  }
  return selfMountsCache;
}

export function resetSelfMountsCache() { selfMountsCache = null; }

/**
 * Pure translation, given what we know about where Homebase runs.
 * `mounts` are this container's own bind mounts (empty outside Docker).
 */
export function translateFolder(folder, { platform = process.platform, inContainer = false, mounts = [] } = {}) {
  if (platform === 'win32') {
    if (!WINDOWS_PATH.test(folder)) throw new DockerInputError('Type the full folder path, like D:\\Projects\\my-site.');
    return folder;
  }
  if (WINDOWS_PATH.test(folder)) {
    if (!inContainer) return folder;
    // Engines that report Windows sources understand Windows paths; Docker
    // Desktop's Linux engine otherwise sees drives under /run/desktop/mnt/host.
    const reportsWindows = mounts.some((m) => WINDOWS_PATH.test(m.source));
    return reportsWindows ? folder : windowsToDesktopEngine(folder);
  }
  if (!inContainer) return folder;
  const hit = mounts
    .filter((m) => folder === m.destination || folder.startsWith(`${m.destination.replace(/\/+$/, '')}/`))
    .sort((a, b) => b.destination.length - a.destination.length)[0];
  if (!hit) {
    throw new DockerInputError(`Homebase runs inside Docker and can't tell where ${folder} is on your computer. Type the folder's full path on your computer instead, like D:\\Projects\\my-site.`);
  }
  const suffix = folder.slice(hit.destination.replace(/\/+$/, '').length).replace(/^\/+/, '');
  if (!suffix) return hit.source;
  const sep = WINDOWS_PATH.test(hit.source) ? '\\' : '/';
  return `${hit.source.replace(/[\\/]+$/, '')}${sep}${suffix.split('/').join(sep)}`;
}

export async function toEngineFolder(input) {
  const folder = cleanFolderPath(input);
  const inContainer = process.platform !== 'win32' && fs.existsSync('/.dockerenv');
  const mounts = inContainer ? await readSelfMounts() : [];
  return translateFolder(folder, { inContainer, mounts });
}
