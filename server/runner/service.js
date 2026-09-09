import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isRunnerRequestAuthorized, requireRunnerSecret } from './auth.js';

const execFileAsync = promisify(execFile);

export function createRunnerApp({ runnerSecret = process.env.RUNNER_SECRET } = {}) {
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

  app.post('/exec', async (req, res) => {
  const { command, args, options } = req.body;

  const cmdPreview = `${command} ${(args || []).join(' ')}`.slice(0, 100);
  console.log(`[Runner] Executing: ${cmdPreview}`);

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 50 * 1024 * 1024,
      ...options,
      shell: process.platform === 'win32' || options?.shell,
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

export function startRunnerService({
  runnerSecret = process.env.RUNNER_SECRET,
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
