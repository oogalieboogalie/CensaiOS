import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { isRunnerRequestAuthorized, requireRunnerSecret } from './auth.js';
import { dockerOnlyViolation, execTarget, inspectViolation } from './dockerOnly.js';

const execFileAsync = promisify(execFile);

// Docker-only mode refuses anything but safe docker calls (dockerOnly.js).
async function refusal(command, args) {
  const why = dockerOnlyViolation(command, args);
  if (why) return why;
  const target = execTarget(args);
  if (!target) return null;
  try {
    const { stdout } = await execFileAsync('docker', ['inspect', '--type', 'container', target], { maxBuffer: 10 * 1024 * 1024 });
    return inspectViolation(stdout);
  } catch {
    return null; // let docker report the missing container itself
  }
}

export function createRunnerApp({
  runnerSecret = process.env.RUNNER_SECRET,
  dockerOnly = process.env.RUNNER_DOCKER_ONLY === 'true',
} = {}) {
  const secret = requireRunnerSecret(runnerSecret);
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.use((req, res, next) => {
    if (!isRunnerRequestAuthorized(secret, req.headers['x-runner-secret'])) {
      console.warn(`Unauthorized access attempt from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  if (dockerOnly) {
    app.use('/fs', (req, res) => res.status(403).json({ error: 'File access is off: this runner only runs Docker.' }));
  }

  app.post('/exec', async (req, res) => {
  const { command, args, options } = req.body;
  if (dockerOnly) {
    const why = await refusal(command, args);
    if (why) {
      console.warn(`[Runner] Refused: ${String(command)} ${(args || []).join(' ').slice(0, 100)} (${why})`);
      return res.json({ stdout: '', stderr: `Refused by the Docker gatekeeper: ${why}.`, code: 126 });
    }
  }

  const cmdPreview = `${command} ${(args || []).join(' ')}`.slice(0, 100);
  console.log(`[Runner] Executing: ${cmdPreview}`);

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 50 * 1024 * 1024,
      ...options,
      shell: dockerOnly ? false : (process.platform === 'win32' || options?.shell),
    });
    res.json({ stdout, stderr, code: 0 });
  } catch (err) {
    console.error(`[Runner] Command failed: ${cmdPreview}`, err.message);
    res.json({
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || '',
      code: err.code ?? err.status ?? 1,
    });
  }
  });

  app.post('/fs/read', async (req, res) => {
  const { path: filePath, encoding = 'utf8' } = req.body;
  console.log(`[Runner] FS Read: ${filePath}`);
  try {
    const content = await fs.promises.readFile(filePath, encoding);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  });

  app.post('/fs/write', async (req, res) => {
  const { path: filePath, content, encoding = 'utf8' } = req.body;
  console.log(`[Runner] FS Write: ${filePath}`);
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
  console.log(`[Runner] FS List: ${dirPath}`);
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
  const app = createRunnerApp({ runnerSecret });
  return app.listen(port, '0.0.0.0', () => {
    console.log(`Censai Hub Runner Service started on port ${port}`);
  });
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try { startRunnerService(); }
  catch (error) {
    console.error(`Runner service refused to start: ${error.code || error.message}`);
    process.exitCode = 1;
  }
}
