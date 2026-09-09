import path from 'path';
import crypto from 'crypto';

export const WORKDIR = '/workspace';
export const CONTAINER_PREFIX = 'homebase-sbx-';

export function sandboxNameForPath(hostPath) {
  const normalized = path.resolve(hostPath).replace(/[\\/]+$/, '').toLowerCase();
  const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 12);
  return `${CONTAINER_PREFIX}${hash}`;
}

export function bindMountSource(hostPath) {
  return path.resolve(hostPath);
}

export function containerWorkdir(relCwd) {
  if (!relCwd || relCwd === '.' || relCwd === '/') return WORKDIR;
  const joined = path.posix.normalize(path.posix.join(WORKDIR, relCwd.replace(/\\/g, '/')));
  return joined.startsWith(WORKDIR) ? joined : WORKDIR;
}
