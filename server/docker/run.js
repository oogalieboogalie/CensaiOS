import { docker, assertRef, DockerInputError } from './cli.js';
import { dockerFailureReason } from './failureReason.js';
import { createLogger } from '../logger.js';
import { optionArgs, parseEnv, parseRestart, parseShare } from './runOptions.js';

// Start a new container from an image (the Images list's Run button).
// Only the image, an optional name, published ports and the settings in
// runOptions.js are accepted, each checked, so nothing typed in the window
// reaches the CLI as a flag. The log names how many settings there were,
// never their values, and never the image or the container's name, which
// can carry a project folder's name (shared/logs/addressNames.js).

const log = createLogger('docker');
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
const MAX_PORTS = 10;

function portNumber(value) {
  const n = Number(value);
  if (!/^\d{1,5}$/.test(String(value).trim()) || n < 1 || n > 65535) {
    throw new DockerInputError(`"${String(value).slice(0, 20)}" isn't a port number (1 to 65535).`);
  }
  return n;
}

/** "8080:80, 3000" (or an array of those) -> ['8080:80', '3000:3000']. */
export function parsePorts(input) {
  const parts = (Array.isArray(input) ? input : String(input ?? '').split(/[\s,]+/))
    .map((p) => String(p).trim()).filter(Boolean);
  if (parts.length > MAX_PORTS) throw new DockerInputError(`Publish at most ${MAX_PORTS} ports.`);
  return parts.map((part) => {
    const pieces = part.split(':');
    if (pieces.length > 2) throw new DockerInputError(`Write ports as computer:container, like 8080:80 (got "${part.slice(0, 20)}").`);
    const host = portNumber(pieces[0]);
    const container = portNumber(pieces[1] ?? pieces[0]);
    return `${host}:${container}`;
  });
}

function describe(what) {
  return `ports ${what.ports.join(', ') || 'none'}, ${what.settings} setting${what.settings === 1 ? '' : 's'}, shared folder ${what.shared ? 'yes' : 'no'}, restart ${what.restart}`;
}

export async function runContainer({ image, name, ports, env, share, restart } = {}) {
  const what = { ports: [], settings: 0, shared: false, restart: 'no' };
  try {
    assertRef(image, 'image');
    const cleanName = String(name ?? '').trim();
    if (cleanName && !NAME_PATTERN.test(cleanName)) {
      throw new DockerInputError('Names use letters, numbers, dots, dashes and underscores, and start with a letter or number.');
    }
    what.ports = parsePorts(ports);
    const settings = parseEnv(env);
    what.settings = settings.length;
    const folder = parseShare(share);
    what.shared = Boolean(folder);
    what.restart = parseRestart(restart);
    const args = ['run', '-d'];
    if (cleanName) args.push('--name', cleanName);
    // This computer only: the runner refuses ports open to the Wi-Fi.
    for (const p of what.ports) args.push('-p', `127.0.0.1:${p}`);
    args.push(...optionArgs({ env: settings, share: folder, restart: what.restart }));
    const { stdout } = await docker([...args, image], { timeout: 5 * 60_000 });
    const id = stdout.trim().split('\n').pop() || '';
    log.info(`run: started a container, ${describe(what)} (${id.slice(0, 12)})`);
    return { ok: true, id, image, name: cleanName || null, ports: what.ports, settings: what.settings, shared: what.shared, restart: what.restart };
  } catch (err) {
    log.warn(`run: could not start a container, ${describe(what)}: ${dockerFailureReason(err)}`);
    throw err;
  }
}
