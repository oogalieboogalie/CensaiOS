import express from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const sdkScript = path.join(repoRoot, 'scripts', 'window-sdk.mjs');

export const windowSdkRouter = express.Router();

function isWriteAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_WINDOW_SDK_WRITES === 'true';
}

function runSdk(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [sdkScript, ...args], {
      cwd: repoRoot,
      windowsHide: true,
      shell: false,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      const result = { code, stdout, stderr };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(stderr || stdout || `Window SDK exited with code ${code}`), result));
    });
  });
}

function cleanIdentifier(value) {
  return String(value || '').trim();
}

function cleanNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.round(parsed)) : String(fallback);
}

windowSdkRouter.post('/window-sdk/scaffold', async (req, res) => {
  if (!isWriteAllowed()) {
    return res.status(403).json({ error: 'Window SDK writes are disabled in production.' });
  }

  const kind = cleanIdentifier(req.body?.kind);
  const component = cleanIdentifier(req.body?.component);
  const label = String(req.body?.label || kind || '').trim();
  const title = String(req.body?.title || label || '').trim();
  const width = cleanNumber(req.body?.width, 520);
  const height = cleanNumber(req.body?.height, 360);
  const dryRun = req.body?.dryRun === true;

  if (!kind || !component || !label) {
    return res.status(400).json({ error: 'kind, component, and label are required.' });
  }

  try {
    const result = await runSdk([
      'scaffold',
      kind,
      '--component',
      component,
      '--label',
      label,
      '--width',
      width,
      '--height',
      height,
      '--title',
      title,
      ...(dryRun ? ['--dry-run'] : []),
    ]);
    res.json({ ok: true, kind, component, label, dryRun, stdout: result.stdout, stderr: result.stderr });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      code: error.code ?? 1,
    });
  }
});

windowSdkRouter.post('/window-sdk/new', async (req, res) => {
  if (!isWriteAllowed()) {
    return res.status(403).json({ error: 'Window SDK writes are disabled in production.' });
  }

  const name = String(req.body?.name || req.body?.label || '').trim();
  const kind = cleanIdentifier(req.body?.kind);
  const component = cleanIdentifier(req.body?.component);
  const width = cleanNumber(req.body?.width, 520);
  const height = cleanNumber(req.body?.height, 360);
  const button = String(req.body?.button || 'Run').trim();
  const text = String(req.body?.text || '').trim();
  const dryRun = req.body?.dryRun === true;

  if (!name) {
    return res.status(400).json({ error: 'name is required.' });
  }

  try {
    const result = await runSdk([
      'new',
      '--name',
      name,
      ...(kind ? ['--kind', kind] : []),
      ...(component ? ['--component', component] : []),
      '--width',
      width,
      '--height',
      height,
      '--button',
      button,
      ...(text ? ['--text', text] : []),
      ...(dryRun ? ['--dry-run'] : []),
    ]);
    res.json({ ok: true, name, kind, component, dryRun, stdout: result.stdout, stderr: result.stderr });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      code: error.code ?? 1,
    });
  }
});

windowSdkRouter.post('/window-sdk/validate', async (_req, res) => {
  try {
    const result = await runSdk(['validate']);
    res.json({ ok: true, stdout: result.stdout, stderr: result.stderr });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      code: error.code ?? 1,
    });
  }
});
