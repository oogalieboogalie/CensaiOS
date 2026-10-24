import fs from 'fs';
import path from 'path';

// What a container may mount. A host folder must sit inside the projects
// folder (and outside censaiOS's own folder); a named volume must not be
// one of censaiOS's own (database, app state, the runner's secret). Paths
// are resolved first, the way Docker will, so `/tmp/../etc` is /etc and
// D:\Projects, /run/desktop/mnt/host/d/Projects and /host_mnt/d/Projects
// are one and the same folder.

export const STACK_VOLUMES = ['pgdata18root', 'qdrant_data', 'homebase_state', 'runner_secret'];
const VOLUME_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const DRIVE = /^([A-Za-z]):(\/.*)?$/;
const DESKTOP = /^\/(?:run\/desktop\/mnt\/host|host_mnt|mnt\/host)\/([A-Za-z])(\/.*)?$/;
const SYSTEM_DIRS = ['/etc', '/proc', '/sys', '/dev', '/boot', '/root', '/usr', '/bin', '/sbin', '/lib', '/var/lib/docker', '/var/run', '/run/docker'];

export const isVolumeName = (s) => VOLUME_NAME.test(String(s ?? ''));

/**
 * One spelling per folder: `..` and `.` resolved, a relative path taken from
 * `cwd` (Docker's CLI does that), Windows and Docker Desktop drive forms as
 * /run/desktop/mnt/host/<drive>/... in lower case. Null for device and
 * network paths (\\?\, \\.\pipe, \\server).
 */
export function canonicalHostPath(input, cwd = '/') {
  let s = String(input ?? '').trim().replace(/\\/g, '/');
  if (!s || s.startsWith('//') || s.includes('\0')) return null;
  const drive = s.match(DRIVE);
  if (drive) s = `/run/desktop/mnt/host/${drive[1]}${drive[2] || ''}`;
  s = path.posix.resolve('/', s.startsWith('/') ? s : path.posix.join(cwd, s));
  const desk = s.match(DESKTOP);
  return desk ? `/run/desktop/mnt/host/${desk[1]}${desk[2] || ''}`.toLowerCase() : s;
}

export const within = (p, root) => p === root || p.startsWith(root === '/' ? '/' : `${root}/`);

/** The coarse check: why a bind source is never fine, or null. */
export function badMountSource(source) {
  if (source === null || source === undefined || String(source).trim() === '') return null;
  if (isVolumeName(String(source).trim())) return null; // a named volume
  const s = canonicalHostPath(source);
  if (!s) return 'a device or network path';
  const low = s.toLowerCase();
  if (low.includes('docker.sock') || low.endsWith('/docker_engine')) return 'the Docker socket';
  if (s === '/' || /^\/run\/desktop\/mnt\/host(\/[a-z])?$/.test(s) || /^\/(mnt|host_mnt|run\/desktop\/mnt)$/.test(s)) return 'a whole drive';
  if (within(s, '/run/desktop/mnt/host/wsl')) return 'a system folder';
  if (SYSTEM_DIRS.some((d) => within(s, d))) return 'a system folder';
  return null;
}

export const isStackVolume = (name, facts = {}) => facts.volumes?.has(name)
  || STACK_VOLUMES.some((v) => name === v || name.endsWith(`_${v}`));

/** `-v src:dst[:opts]` -> { type, source }; null for an anonymous volume. */
export function volumeFlagMount(value) {
  const v = String(value);
  let source;
  if (/^[A-Za-z]:[\\/]/.test(v)) {
    const at = v.indexOf(':', 2);
    source = at > 0 ? v.slice(0, at) : v;
  } else {
    const at = v.indexOf(':');
    if (at <= 0) return null; // "-v /data" is an anonymous volume
    source = v.slice(0, at);
  }
  return { type: isVolumeName(source) ? 'volume' : 'bind', source };
}

/** `--mount k=v,...` -> { type, source, refusal? }. */
export function mountFlagMount(value) {
  const v = String(value);
  if (/["']/.test(v)) return { refusal: 'quoted' };
  const seen = new Map();
  for (const part of v.split(',')) {
    const eq = part.indexOf('=');
    const key = (eq < 0 ? part : part.slice(0, eq)).trim().toLowerCase();
    if (seen.has(key)) return { refusal: 'repeated' };
    seen.set(key, eq < 0 ? 'true' : part.slice(eq + 1));
  }
  const type = String(seen.get('type') || 'volume').toLowerCase();
  if ([...seen.keys()].some((k) => k === 'volume-driver' || k.startsWith('volume-opt'))) return { refusal: 'volume-options' };
  return { type, source: seen.get('source') ?? seen.get('src') ?? '' };
}

/** { code, why } when this mount may not be used, else null. */
export function mountRefusal(mount, facts = {}) {
  if (!mount) return null;
  if (mount.refusal) return { code: 'mount-options', why: 'that --mount form is not allowed' };
  const { type, source } = mount;
  if (type === 'tmpfs' || type === 'image') return null;
  if (type === 'volume') {
    if (!source) return null;
    if (!isVolumeName(source)) return { code: 'mount-options', why: 'that volume name is not allowed' };
    return isStackVolume(source, facts) ? { code: 'stack-volume', why: "mounting censaiOS's own data volumes is not allowed" } : null;
  }
  if (type !== 'bind') return { code: 'mount-options', why: `--mount type=${type} is not allowed` };
  const coarse = badMountSource(source);
  if (coarse) return { code: 'host-system-mount', why: `mounting ${coarse} is not allowed` };
  const s = canonicalHostPath(source, facts.cwd || process.cwd());
  const root = (facts.projectsRoots || []).find((r) => within(s, r));
  if (!root) return { code: 'mount-outside-projects', why: 'only folders inside the projects folder can be mounted' };
  // The default projects folder sits inside censaiOS's folder; it stays usable.
  if ((facts.blockedFolders || []).some((b) => (within(s, b) || within(b, s)) && !within(root, b))) {
    return { code: 'mount-censaios-folder', why: "censaiOS's own folder cannot be mounted" };
  }
  return null;
}

/**
 * A folder under the projects folder that is (or sits under) a link out of
 * it. The runner sees the projects folder at `facts.projectsMirror`, so the
 * link is followed there; Docker would follow the same link on the PC.
 */
export function linkEscapes(source, facts = {}) {
  const mirror = facts.projectsMirror;
  const s = canonicalHostPath(source, facts.cwd || process.cwd());
  const root = (facts.projectsRoots || []).find((r) => within(s, r));
  if (!mirror || !root || !s) return false;
  let local = path.posix.join(mirror.local, s.slice(root.length));
  let realRoot;
  try { realRoot = fs.realpathSync(mirror.local); } catch { return false; }
  for (;;) {
    try { return !within(fs.realpathSync(local), realRoot); } catch { /* not there yet */ }
    const up = path.posix.dirname(local);
    if (up === local || !within(up, mirror.local)) return false;
    local = up;
  }
}
