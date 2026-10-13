// Docker-only mode for the runner (RUNNER_DOCKER_ONLY=true). The runner is
// the one service that holds the Docker socket; in this mode it runs nothing
// but `docker`, and refuses the well-known ways a container can take over
// the computer it runs on: privileged containers, sharing the host's
// network or processes, mounting the Docker socket, a whole drive or a
// system folder, and shelling into a container that holds the socket.

const SUBCOMMANDS = new Set([
  'ps', 'info', 'version', 'system', 'stats', 'inspect', 'logs', 'exec', 'start', 'stop', 'restart',
  'pause', 'unpause', 'kill', 'rm', 'images', 'image', 'pull', 'rmi', 'volume', 'network', 'container',
  'compose', 'run', 'create', 'port', 'top',
]);

const BANNED_FLAGS = [
  '--privileged', '--cap-add', '--device', '--security-opt', '--pid', '--ipc', '--uts', '--userns',
  '--cgroupns', '--cgroup-parent', '--volumes-from', '--device-cgroup-rule', '--add-host', '--mount-propagation',
];

const SYSTEM_DIRS = ['/etc', '/proc', '/sys', '/dev', '/boot', '/root', '/usr', '/bin', '/sbin', '/lib', '/var/lib/docker', '/var/run', '/run/docker'];

function norm(p) {
  return String(p || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() || '/';
}

/** Why a bind-mount source is refused, or null when it is fine. */
export function badMountSource(source) {
  if (source === null || source === undefined || String(source).trim() === '') return null;
  const s = norm(source);
  if (!s.includes('/') && !/^[a-z]:/.test(s)) return null; // a named volume
  if (s.includes('docker.sock') || s.endsWith('/docker_engine')) return 'the Docker socket';
  if (s === '/' || /^[a-z]:\/?$/.test(s) || /^\/(run\/desktop\/mnt\/host|mnt\/host|mnt|host_mnt)(\/[a-z])?$/.test(s)) return 'a whole drive';
  if (s === '/run/desktop/mnt/host/wsl' || s.startsWith('/run/desktop/mnt/host/wsl/')) return 'a system folder';
  if (SYSTEM_DIRS.some((d) => s === d || s.startsWith(`${d}/`))) return 'a system folder';
  return null;
}

function volumeSource(value) {
  const v = String(value);
  if (/^[A-Za-z]:[\\/]/.test(v)) {
    const at = v.indexOf(':', 2);
    return at > 0 ? v.slice(0, at) : v;
  }
  const at = v.indexOf(':');
  return at > 0 ? v.slice(0, at) : null; // "-v /data" is an anonymous volume
}

function mountSource(value) {
  const parts = String(value).split(',').map((p) => p.split('='));
  const type = parts.find(([k]) => k === 'type')?.[1] || 'volume';
  if (type !== 'bind') return null;
  return parts.find(([k]) => k === 'source' || k === 'src')?.[1] || '';
}

const flagValue = (args, i, name) => {
  const a = args[i];
  if (a === name) return args[i + 1];
  if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
  return undefined;
};

/** Why this call is refused in docker-only mode, or null when it may run. */
export function dockerOnlyViolation(command, args = []) {
  if (command !== 'docker') return 'only docker commands run here';
  const list = (args || []).map(String);
  const sub = list.find((a) => !a.startsWith('-'));
  if (!sub || !SUBCOMMANDS.has(sub)) return `docker ${sub || ''} is not allowed`.trim();
  if (sub === 'compose' && list.includes('up')) return 'docker compose up is not allowed from censaiOS';
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const banned = BANNED_FLAGS.find((f) => a === f || a.startsWith(`${f}=`));
    if (banned) return `${banned} is not allowed`;
    for (const name of ['--network', '--net']) {
      const v = flagValue(list, i, name);
      if (v !== undefined && (v === 'host' || v.startsWith('container:'))) return `${name} ${v} is not allowed`;
    }
    for (const name of ['-v', '--volume']) {
      const v = flagValue(list, i, name);
      const why = v !== undefined && badMountSource(volumeSource(v));
      if (why) return `mounting ${why} is not allowed`;
    }
    const m = flagValue(list, i, '--mount');
    if (m !== undefined) {
      const why = badMountSource(mountSource(m));
      if (why) return `mounting ${why} is not allowed`;
    }
  }
  return null;
}

/** The container `docker exec` targets (first non-flag after exec). */
export function execTarget(args = []) {
  const list = (args || []).map(String);
  const at = list.indexOf('exec');
  if (at < 0) return null;
  const WITH_VALUE = new Set(['-e', '--env', '-u', '--user', '-w', '--workdir', '--env-file', '--detach-keys']);
  for (let i = at + 1; i < list.length; i++) {
    if (WITH_VALUE.has(list[i])) { i += 1; continue; }
    if (!list[i].startsWith('-')) return list[i];
  }
  return null;
}

/** A container that holds the socket or runs privileged is off limits to exec. */
export function inspectViolation(inspectJson) {
  let info;
  try { info = JSON.parse(inspectJson); } catch { return 'that container could not be checked'; }
  const c = Array.isArray(info) ? info[0] : info;
  if (!c) return 'that container could not be checked';
  if (c.HostConfig?.Privileged) return 'that container is privileged';
  if ((c.Mounts || []).some((m) => m.Type !== 'volume' && badMountSource(m.Source))) return 'that container can reach the Docker socket or the whole computer';
  return null;
}
