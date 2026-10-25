import { DockerInputError } from './cli.js';

// The Run form's extra settings: environment settings, one shared folder and
// a restart policy. Each is checked here and handed to the CLI as its own
// argument (never through a shell), so nothing typed becomes a flag.

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_.]{0,127}$/;
const MAX_ENV = 40;
const MAX_VALUE = 4096;
export const RESTART_POLICIES = ['no', 'on-failure', 'unless-stopped', 'always'];

/** "NAME=value" lines (or an array of them) -> [['NAME', 'value'], ...]. */
export function parseEnv(input) {
  const lines = (Array.isArray(input) ? input : String(input ?? '').split(/\r?\n/))
    .map((l) => String(l).trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length > MAX_ENV) throw new DockerInputError(`Add at most ${MAX_ENV} settings.`);
  const seen = new Set();
  return lines.map((line) => {
    const eq = line.indexOf('=');
    const key = (eq < 0 ? line : line.slice(0, eq)).trim();
    if (eq < 0 || !ENV_NAME.test(key)) {
      throw new DockerInputError(`Write each setting as NAME=value, one per line (the name uses letters, numbers and _). "${key.slice(0, 30)}" doesn't fit.`);
    }
    if (seen.has(key)) throw new DockerInputError(`${key} is listed twice.`);
    seen.add(key);
    const value = line.slice(eq + 1).trim();
    if (value.length > MAX_VALUE) throw new DockerInputError(`The value for ${key} is too long.`);
    if (/[\0\r\n]/.test(value)) throw new DockerInputError(`The value for ${key} has a line break or a hidden character in it.`);
    return [key, value];
  });
}

const HOST_ABSOLUTE = /^(\/|[A-Za-z]:[\\/])/;
const ROOTS = /^(\/|[A-Za-z]:[\\/]?)$/;

/**
 * A folder on this computer shared into the container, or null. Uses the
 * --mount form, so Windows drive letters need no colon juggling; commas and
 * quotes would break that form, so they are refused.
 */
export function parseShare(share) {
  const host = String(share?.host ?? '').trim();
  const target = String(share?.target ?? '').trim();
  if (!host && !target) return null;
  if (!host || !target) throw new DockerInputError('A shared folder needs both the folder on this computer and where it shows up inside the container.');
  for (const [label, value] of [['folder on this computer', host], ['path inside the container', target]]) {
    if (/[,"'\n\r\0]/.test(value) || value.length > 500) throw new DockerInputError(`The ${label} can't have commas or quotes.`);
  }
  if (!HOST_ABSOLUTE.test(host)) throw new DockerInputError('Give the full folder path on this computer, like D:\\data or /home/sam/data.');
  if (ROOTS.test(host)) throw new DockerInputError('Share a folder, not the whole drive.');
  if (/docker\.sock/i.test(host)) throw new DockerInputError("Sharing Docker's own control socket would hand the container the whole engine, so it isn't allowed here.");
  if (!target.startsWith('/') || target === '/') throw new DockerInputError('The path inside the container starts with / and names a folder, like /data.');
  return { host, target, readOnly: Boolean(share?.readOnly) };
}

export function parseRestart(value) {
  const policy = String(value ?? '').trim() || 'no';
  if (!RESTART_POLICIES.includes(policy)) throw new DockerInputError('Pick when Docker should start it again from the list.');
  return policy;
}

/** The checked settings as docker run arguments. */
export function optionArgs({ env = [], share = null, restart = 'no' }) {
  const args = [];
  for (const [key, value] of env) args.push('-e', `${key}=${value}`);
  if (share) args.push('--mount', `type=bind,source=${share.host},target=${share.target}${share.readOnly ? ',readonly' : ''}`);
  if (restart !== 'no') args.push('--restart', restart);
  return args;
}
