// Reads `docker run|create|exec` arguments the way the Docker CLI does, so
// the gate sees exactly the options Docker will use: `-v/etc:/x`, `-dv x`,
// `--volume=x` and `-p=x` all count. Docker stops reading options at the
// image (or, for exec, the container), so what follows is the container's
// own command and is not read. A flag this table does not know is refused
// rather than guessed at: guessing wrong could hide the next argument.

const RUN_VALUE = [
  'add-host', 'annotation', 'attach', 'blkio-weight', 'blkio-weight-device', 'cap-add', 'cap-drop', 'cgroup-parent',
  'cgroupns', 'cidfile', 'cpu-period', 'cpu-quota', 'cpu-rt-period', 'cpu-rt-runtime', 'cpu-shares', 'cpus',
  'cpuset-cpus', 'cpuset-mems', 'detach-keys', 'device', 'device-cgroup-rule', 'device-read-bps', 'device-read-iops',
  'device-write-bps', 'device-write-iops', 'dns', 'dns-option', 'dns-search', 'domainname', 'entrypoint', 'env',
  'env-file', 'expose', 'gpus', 'group-add', 'health-cmd', 'health-interval', 'health-retries', 'health-start-interval',
  'health-start-period', 'health-timeout', 'hostname', 'ip', 'ip6', 'ipc', 'isolation', 'kernel-memory', 'label',
  'label-file', 'link', 'link-local-ip', 'log-driver', 'log-opt', 'mac-address', 'memory', 'memory-reservation',
  'memory-swap', 'memory-swappiness', 'mount', 'name', 'network', 'net', 'network-alias', 'net-alias', 'oom-score-adj',
  'pid', 'pids-limit', 'platform', 'publish', 'pull', 'restart', 'runtime', 'security-opt', 'shm-size', 'stop-signal',
  'stop-timeout', 'storage-opt', 'sysctl', 'tmpfs', 'ulimit', 'user', 'userns', 'uts', 'volume', 'volume-driver',
  'volumes-from', 'workdir',
];
const RUN_BOOL = [
  'detach', 'init', 'interactive', 'tty', 'no-healthcheck', 'oom-kill-disable', 'privileged', 'publish-all', 'quiet',
  'read-only', 'rm', 'sig-proxy', 'disable-content-trust', 'help', 'use-api-socket',
];
const RUN_SHORT = {
  a: 'attach', c: 'cpu-shares', d: 'detach', e: 'env', h: 'hostname', i: 'interactive', l: 'label', m: 'memory',
  p: 'publish', P: 'publish-all', q: 'quiet', t: 'tty', u: 'user', v: 'volume', w: 'workdir',
};

const EXEC_VALUE = ['detach-keys', 'env', 'env-file', 'user', 'workdir'];
const EXEC_BOOL = ['detach', 'interactive', 'tty', 'privileged', 'help'];
const EXEC_SHORT = { d: 'detach', e: 'env', i: 'interactive', t: 'tty', u: 'user', w: 'workdir' };

const ALIASES = { net: 'network', 'net-alias': 'network-alias' };

export const RUN_FLAGS = { value: new Set(RUN_VALUE), bool: new Set(RUN_BOOL), short: RUN_SHORT };
export const EXEC_FLAGS = { value: new Set(EXEC_VALUE), bool: new Set(EXEC_BOOL), short: EXEC_SHORT };

/**
 * Options before the first plain argument, as [{ name, value }] with long
 * names, plus where that first plain argument sits. `error` is set when a
 * flag is unknown or its value is missing.
 */
export function readOptions(tokens, table) {
  const opts = [];
  const takesValue = (name) => table.value.has(name);
  const known = (name) => table.value.has(name) || table.bool.has(name);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') return { opts, at: i + 1 };
    if (!t.startsWith('-') || t === '-') return { opts, at: i };
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      const raw = eq < 0 ? t.slice(2) : t.slice(2, eq);
      const name = ALIASES[raw] || raw;
      if (!known(name)) return { opts, error: 'unknown-flag' };
      if (eq >= 0) opts.push({ name, value: t.slice(eq + 1) });
      else if (takesValue(name)) {
        if (i + 1 >= tokens.length) return { opts, error: 'missing-value' };
        opts.push({ name, value: tokens[++i] });
      } else opts.push({ name, value: 'true' });
      continue;
    }
    // A cluster of one-letter flags: -dit, -v/x:/y, -p=8080:80, -dv x.
    for (let j = 1; j < t.length; j++) {
      const name = table.short[t[j]];
      if (!name) return { opts, error: 'unknown-flag' };
      const rest = t.slice(j + 1);
      if (takesValue(name)) {
        if (rest) opts.push({ name, value: rest.startsWith('=') ? rest.slice(1) : rest });
        else if (i + 1 < tokens.length) opts.push({ name, value: tokens[++i] });
        else return { opts, error: 'missing-value' };
        break;
      }
      if (rest.startsWith('=')) { opts.push({ name, value: rest.slice(1) }); break; }
      opts.push({ name, value: 'true' });
    }
  }
  return { opts, at: tokens.length };
}

/** Whether a boolean option is on (`--rm`, `--rm=true`, `-P`). */
export const isOn = (opt) => !/^(false|0)$/i.test(String(opt.value));
