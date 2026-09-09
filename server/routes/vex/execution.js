import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { getRunDir, readRunFile } from './core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

export const executionRouter = Router();

const ORCHESTRATOR_PATH = path.join(REPO_ROOT, 'vex', 'lib', 'agents', 'orchestrator.js');

// In-memory run state (for this process lifetime)
const activeRuns = new Map();

executionRouter.post('/run', async (req, res) => {
  const { task = 'demo', payload = {}, filter } = req.body || {};

  const env = {
    ...process.env,
    VEX_TASK: String(task),
    VEX_PAYLOAD: JSON.stringify(payload),
    VEX_FILTER: filter ? String(filter) : '',
  };

  let child;
  try {
    child = spawn(process.execPath, [ORCHESTRATOR_PATH], {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
  } catch (err) {
    return res.status(500).json({ error: `Failed to start orchestrator: ${err.message}` });
  }

  let runId = null;
  let stdoutBuffer = '';

  const runState = {
    pid: child.pid,
    task,
    startedAt: new Date().toISOString(),
    status: 'running',
    stdout: [],
    stderr: [],
    exitCode: null,
  };

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    stdoutBuffer += text;
    if (!runId) {
      const match = stdoutBuffer.match(/run:\s*(run_\d+_[a-z0-9]+)/);
      if (match) {
        runId = match[1];
        activeRuns.set(runId, runState);
        runState.runId = runId;
      }
    }
    runState.stdout.push(text);
  });

  child.stderr.on('data', (chunk) => {
    runState.stderr.push(chunk.toString('utf8'));
  });

  child.on('close', (code) => {
    runState.status = code === 0 ? 'complete' : 'failed';
    runState.exitCode = code;
    runState.completedAt = new Date().toISOString();
    if (!runId) {
      const match = stdoutBuffer.match(/run:\s*(run_\d+_[a-z0-9]+)/);
      if (match) {
        runId = match[1];
        activeRuns.set(runId, runState);
      }
    }
  });

  await new Promise(resolve => setTimeout(resolve, 800));

  if (!runId) {
    runId = `pending_${Date.now()}`;
  }

  res.json({
    ok: true,
    run_id: runId,
    task,
    status: 'started',
    message: 'Orchestration started. Poll /api/vex/status/:id for progress.',
  });
});

executionRouter.get('/status/:id', (req, res) => {
  const { id } = req.params;
  const runDir = getRunDir(id);

  if (!runDir || !existsSync(runDir)) {
    const inMem = activeRuns.get(id);
    if (inMem) {
      return res.json({
        run_id: id,
        status: inMem.status,
        task: inMem.task,
        started_at: inMem.startedAt,
        stdout_tail: inMem.stdout.slice(-10).join(''),
        stderr_tail: inMem.stderr.join('').slice(-500),
      });
    }
    return res.status(404).json({ error: `Run not found: ${id}` });
  }

  const meta = readRunFile(runDir, 'run_meta.json');
  const events = readRunFile(runDir, 'events.json');
  const aggregate = readRunFile(runDir, 'aggregate.json');

  res.json({
    run_id: id,
    status: meta?.completed_at ? 'complete' : 'running',
    meta,
    events: events || [],
    aggregate,
  });
});

executionRouter.get('/runs/:id', (req, res) => {
  const { id } = req.params;
  const runDir = getRunDir(id);
  if (!runDir || !existsSync(runDir)) {
    return res.status(404).json({ error: `Run not found: ${id}` });
  }
  const meta = readRunFile(runDir, 'run_meta.json');
  const events = readRunFile(runDir, 'events.json');
  const aggregate = readRunFile(runDir, 'aggregate.json');
  res.json({ run_id: id, meta, events, aggregate });
});
