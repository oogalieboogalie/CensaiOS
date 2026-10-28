import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { isRunnerRequestAuthorized, requireRunnerSecret } from './auth.js';
import { withRunnerDefaults } from './dockerOnly.js';
import { cachedStack, gateRefusal } from './dockerStack.js';
import { createLogger } from '../logger.js';

// Lines carry the program's bare name and outcome only: never arguments,
// file paths, addresses or file contents.
const log = createLogger('runner');
const programName = (command) => {
  const base = path.basename(String(command || ''));
  return /^[\w.-]{1,32}$/.test(base) ? base : 'other';
};

const execFileAsync = promisify(execFile);

// Docker-only mode refuses anything but safe docker calls (dockerOnly.js,
// dockerStack.js). The gate's own lookups run docker directly.
const runDocker = async (args) => (await execFileAsync('docker', args, { maxBuffer: 10 * 1024 * 1024, timeout: 15_000 })).stdout;

// Asked once (at start, or at the first compose call): without the compose
// plugin a compose call gets a plain sentence instead of Docker's own error.
export function composeCheck(run) {
  let found;
  return () => (found ??= run(['compose', 'version']).then(() => true, () => false).then((ok) => {
    log.info(ok ? 'compose plugin found' : 'compose plugin missing');
    return ok;
  }));
}

// The caller's options never reach the child process in docker-only mode
// (an env could point docker at another engine); elsewhere only these do.
// The run time and output size are capped here, whatever the caller asked.
const MAX_BUFFER = 50 * 1024 * 1024;
const MAX_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
export function childOptions(options, dockerOnly) {
  const asked = Number(options?.timeout);
  const timeout = Number.isFinite(asked) && asked > 0 ? Math.min(Math.max(asked, 1000), MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  const askedBuffer = Number(options?.maxBuffer);
  const maxBuffer = Number.isFinite(askedBuffer) && askedBuffer > 0 ? Math.min(askedBuffer, MAX_BUFFER) : MAX_BUFFER;
  if (dockerOnly) return { timeout, maxBuffer, shell: false, windowsHide: true };
  const { cwd, windowsHide, encoding } = options || {};
  // A missing encoding would hand back raw bytes that turn into JSON junk.
  return { cwd, windowsHide, encoding: encoding || 'utf8', timeout, maxBuffer, shell: process.platform === 'win32' || Boolean(options?.shell) };
}

// Asked at start: the runner runs as a normal user and reaches Docker only
// through the socket's group (docker-compose.yml, CENSAI_DOCKER_GID).
export async function dockerSocketCheck(run, uid = process.getuid?.() ?? null) {
  try {
    await run(['version', '--format', '{{.Server.Version}}']);
    log.info('docker socket reachable', { uid });
    return true;
  } catch {
    log.warn('docker socket not reachable as a normal user', { uid });
    return false;
  }
}

export function createRunnerApp({
  runnerSecret = process.env.RUNNER_SECRET,
  dockerOnly = process.env.RUNNER_DOCKER_ONLY !== 'false',
  run = runDocker,
  stack = cachedStack(run),
  composeFound = composeCheck(run),
} = {}) {
  const secret = requireRunnerSecret(runnerSecret);
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.use((req, res, next) => {
    if (!isRunnerRequestAuthorized(secret, req.headers['x-runner-secret'])) {
      log.warn('runner request refused: wrong or missing runner secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  if (dockerOnly) {
    app.use('/fs', (req, res) => res.status(403).json({ error: 'File access is off: this runner only runs Docker.' }));
  }

  app.post('/exec', async (req, res) => {
  const { command, options } = req.body;
  let { args } = req.body;
  if (dockerOnly) {
    const why = await gateRefusal(command, args, await stack(), run);
    if (why) {
      log.warn('runner command refused by the Docker gatekeeper', { program: programName(command), reason: why.code });
      return res.json({ stdout: '', stderr: `Refused by the Docker gatekeeper: ${why.why}.`, code: 126 });
    }
    if (args?.[0] === 'compose' && !(await composeFound())) {
      log.warn('runner command refused by the Docker gatekeeper', { program: programName(command), reason: 'compose-missing' });
      return res.json({ stdout: '', stderr: 'Compose is not installed in this runner.', code: 126 });
    }
    args = withRunnerDefaults(args);
  }

  log.info('runner command started', { program: programName(command) });

  try {
    const { stdout, stderr } = await execFileAsync(command, args, childOptions(options, dockerOnly));
    res.json({ stdout, stderr, code: 0 });
  } catch (err) {
    log.warn('runner command failed', { program: programName(command), code: err.code ?? err.status ?? 1 });
    res.json({
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || '',
      code: err.code ?? err.status ?? 1,
    });
  }
  });

  app.post('/fs/read', async (req, res) => {
  const { path: filePath, encoding = 'utf8' } = req.body;
  log.info('runner file read');
  try {
    const content = await fs.promises.readFile(filePath, encoding);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  });

  app.post('/fs/write', async (req, res) => {
  const { path: filePath, content, encoding = 'utf8' } = req.body;
  log.info('runner file write');
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, encoding);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  });

  app.post('/fs/list', async (req, res) => {
  const { path: dirPath } = req.body;
  log.info('runner folder list');
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    res.json({
      entries: entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile()
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  });

  app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: '0.1.0',
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime()
  });
  });

  return app;
}

/**
 * RUNNER_SECRET, or (when unset) the secret in RUNNER_SECRET_FILE, made on
 * first start. The app reads the same file through a shared private volume,
 * so the Docker stack needs no secret typed into .env.
 */
export function resolveRunnerSecret(env = process.env) {
  if (env.RUNNER_SECRET) return env.RUNNER_SECRET;
  const file = env.RUNNER_SECRET_FILE;
  if (!file) return env.RUNNER_SECRET;
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch { /* first start */ }
  const made = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, made, { mode: 0o640 });
  return made;
}

export function startRunnerService({
  runnerSecret = resolveRunnerSecret(),
  port = process.env.RUNNER_PORT || 3003,
} = {}) {
  const composeFound = composeCheck(runDocker);
  composeFound();
  dockerSocketCheck(runDocker);
  const dockerOnly = process.env.RUNNER_DOCKER_ONLY !== 'false';
  const app = createRunnerApp({ runnerSecret, dockerOnly, composeFound });
  return app.listen(port, '0.0.0.0', () => {
    log.info('runner service started', { port: Number(port), mode: dockerOnly ? 'docker-only' : 'open' });
  });
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try { startRunnerService(); }
  catch (error) {
    log.error('runner service refused to start', { code: error.code || 'unknown' });
    process.exitCode = 1;
  }
}
