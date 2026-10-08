import { runnerClient } from '../runner/client.js';

// Thin, safe wrapper around the docker CLI. Every call goes through the
// runner client, so the same code drives a local daemon (local_desktop) or a
// remote runner (RUNNER_URL) and stays off when dangerous execution is off.

const PROJECT_ROOT = process.cwd();
const IS_WINDOWS = process.platform === 'win32';

// Container names/ids, image refs, volume and network names. The leading
// character can never be "-" so a value can't be read as a CLI flag.
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,254}$/;
const WIN_PLAIN_ARG = /^[A-Za-z0-9_.:/@,+=\\-]*$/;
const WIN_UNSAFE = /["%^&|<>!`\r\n]/;

export class DockerUnavailableError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'DockerUnavailableError';
    this.reason = reason;
    this.status = 503;
  }
}

export class DockerInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DockerInputError';
    this.status = 400;
  }
}

export function assertRef(value, label = 'name') {
  if (typeof value !== 'string' || !REF_PATTERN.test(value)) {
    throw new DockerInputError(`Invalid ${label}: ${String(value).slice(0, 80)}`);
  }
  return value;
}

// The runner uses a shell on Windows, which joins argv with spaces. Quote
// what needs quoting and refuse anything cmd.exe would interpret.
export function prepareArgs(args, platformIsWindows = IS_WINDOWS) {
  if (!platformIsWindows) return args;
  return args.map((arg) => {
    const s = String(arg);
    if (WIN_PLAIN_ARG.test(s) && s !== '') return s;
    if (WIN_UNSAFE.test(s)) {
      throw new DockerInputError('That value has characters Windows can\'t pass to Docker safely.');
    }
    return `"${s}"`;
  });
}

export function classifyFailure(text) {
  const t = String(text || '');
  if (/Dangerous execution is disabled/i.test(t)) {
    return { reason: 'runner-disabled', message: 'Docker control is turned off on this server (RUNNER_ENABLED is off).' };
  }
  if (/RUNNER_SECRET|Runner error|ECONNREFUSED|fetch failed/i.test(t)) {
    return { reason: 'runner-unreachable', message: `Homebase can't reach its command runner (${t.slice(0, 120)}).` };
  }
  if (/ENOENT|not recognized as an internal|command not found|docker: not found/i.test(t)) {
    return { reason: 'not-installed', message: 'The Docker CLI isn\'t installed on this machine.' };
  }
  if (/Cannot connect to the Docker daemon|error during connect|Is the docker daemon running|docker_engine|dockerDesktopLinuxEngine|permission denied while trying to connect/i.test(t)) {
    return { reason: 'daemon-down', message: 'Docker is installed but the engine isn\'t running. Start Docker Desktop (or the docker service) and it will connect automatically.' };
  }
  return null;
}

/**
 * Run `docker <args>`. Resolves { stdout, stderr } on exit 0, throws a
 * DockerUnavailableError when there is no usable daemon and a plain Error
 * carrying Docker's own message otherwise.
 */
export async function docker(args, { timeout = 30_000 } = {}) {
  let result;
  try {
    result = await runnerClient.exec('docker', prepareArgs(args), { cwd: PROJECT_ROOT, timeout });
  } catch (err) {
    const known = classifyFailure(err.message) || (err.code === 'ENOENT' ? classifyFailure('ENOENT') : null);
    if (known) throw new DockerUnavailableError(known.message, known.reason);
    throw err;
  }
  const { stdout = '', stderr = '', code } = result || {};
  if (code === 0) return { stdout, stderr };
  const known = classifyFailure(code === 'ENOENT' ? 'ENOENT' : stderr);
  if (known) throw new DockerUnavailableError(known.message, known.reason);
  const message = String(stderr || stdout || `docker ${args[0]} exited with ${code}`).trim();
  throw new Error(message.replace(/^Error( response from daemon)?:\s*/i, ''));
}

/** `--format json` output: one JSON object per line (or one array). */
export function parseJsonLines(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try { return JSON.parse(text); } catch { /* fall through to line mode */ }
  }
  return text.split('\n').map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

export function parseLabels(raw) {
  if (raw && typeof raw === 'object') return raw;
  const out = {};
  if (typeof raw !== 'string' || !raw) return out;
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
}
