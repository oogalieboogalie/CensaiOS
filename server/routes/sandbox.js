/**
 * Sandbox Toolchain Routes
 *
 * GET  /api/sandbox/toolchains          — list all CLIs + current config + rebuild status
 * POST /api/sandbox/toolchains          — save selection + API keys, trigger auto-rebuild
 * GET  /api/sandbox/rebuild-status      — poll the in-progress rebuild state
 * POST /api/sandbox/rebuild-cancel      — force-remove old image (stops a stuck rebuild)
 * POST /api/sandbox/toolchains/detect   — probe the running sandbox for installed CLIs
 * POST /api/sandbox/toolchains/install  — quick-install one CLI in the running sandbox
 *
 * Rebuild state machine lives in server/sandbox/rebuild.js.
 */

import express from 'express';
import { runnerClient } from '../runner/client.js';
import { createLogger } from '../logger.js';
import { TOOLCHAIN_REGISTRY, TOOLCHAIN_IDS } from '../sandbox/toolchains.js';
import { readToolchainConfig, writeToolchainConfig } from '../sandbox/toolchainConfig.js';
import {
  getRebuildState,
  resetRebuildState,
  removeSandboxImage,
  triggerRebuild,
} from '../sandbox/rebuild.js';
import { requireSystemAdmin } from '../security/systemAdmin.js';

const log = createLogger('sandbox-route');
export const sandboxRouter = express.Router();

async function findRunningSandbox() {
  const { listSandboxes } = await import('../sandbox/lifecycle.js');
  const sandboxes = await listSandboxes();
  return sandboxes.find((s) => s.status && s.status.toLowerCase().startsWith('up'));
}

/**
 * GET /api/sandbox/toolchains
 * Returns full registry + current config + rebuild status.
 */
sandboxRouter.get('/sandbox/toolchains', (_req, res) => {
  const config = readToolchainConfig();
  const rebuildState = getRebuildState();
  const tools = TOOLCHAIN_IDS.map((id) => ({
    ...TOOLCHAIN_REGISTRY[id],
    enabled: config.enabled.includes(id),
    hasApiKey: !!(config.apiKeys[TOOLCHAIN_REGISTRY[id].envKey] || process.env[TOOLCHAIN_REGISTRY[id].envKey]),
  }));
  res.json({
    tools,
    rebuildStatus: rebuildState.status,
    rebuildStartedAt: rebuildState.startedAt,
    rebuildFinishedAt: rebuildState.finishedAt,
    rebuildError: rebuildState.error,
  });
});

/**
 * POST /api/sandbox/toolchains
 * Body: { enabled: string[], apiKeys: Record<string, string> }
 * Saves config and auto-triggers a sandbox image rebuild.
 */
sandboxRouter.post('/sandbox/toolchains', requireSystemAdmin, async (req, res) => {
  try {
    const { enabled = [], apiKeys = {} } = req.body;

    // Validate — only allow known tool IDs
    const validEnabled = enabled.filter((id) => TOOLCHAIN_REGISTRY[id]);

    // Merge with existing keys (don't wipe keys the user didn't touch)
    const existing = readToolchainConfig();
    const mergedKeys = { ...existing.apiKeys };
    for (const [k, v] of Object.entries(apiKeys)) {
      if (typeof v === 'string') {
        if (v.trim() === '') {
          delete mergedKeys[k]; // empty = remove stored key
        } else {
          mergedKeys[k] = v.trim();
        }
      }
    }

    writeToolchainConfig({ enabled: validEnabled, apiKeys: mergedKeys });
    log.info('toolchain config updated', { enabled: validEnabled });

    // Kick off the rebuild in the background
    triggerRebuild();

    res.json({ ok: true, enabled: validEnabled, rebuildTriggered: true });
  } catch (err) {
    log.error('failed to save toolchain config', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sandbox/rebuild-status
 * Returns current rebuild progress for polling.
 */
sandboxRouter.get('/sandbox/rebuild-status', (_req, res) => {
  const rebuildState = getRebuildState();
  res.json({
    status: rebuildState.status,
    startedAt: rebuildState.startedAt,
    finishedAt: rebuildState.finishedAt,
    error: rebuildState.error,
    log: rebuildState.log,
  });
});

/**
 * POST /api/sandbox/rebuild-cancel
 * Force-clears rebuild state (safety valve if a build gets stuck).
 */
sandboxRouter.post('/sandbox/rebuild-cancel', requireSystemAdmin, async (_req, res) => {
  try {
    await removeSandboxImage();
    resetRebuildState();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sandbox/toolchains/detect
 * Probes the running sandbox container to see which CLIs are actually installed.
 */
sandboxRouter.post('/sandbox/toolchains/detect', requireSystemAdmin, async (_req, res) => {
  try {
    const running = await findRunningSandbox();

    if (!running) {
      return res.json({
        sandboxRunning: false,
        results: Object.fromEntries(TOOLCHAIN_IDS.map((id) => [id, { installed: false, version: null }])),
      });
    }

    const results = {};
    for (const id of TOOLCHAIN_IDS) {
      const tool = TOOLCHAIN_REGISTRY[id];
      try {
        const { code, stdout } = await runnerClient.exec(
          'docker',
          ['exec', running.name, 'bash', '-lc', tool.detectCmd],
          { windowsHide: true, timeout: 10_000 }
        );
        results[id] = {
          installed: code === 0,
          version: code === 0 ? stdout.trim().split('\n').pop() || null : null,
        };
      } catch {
        results[id] = { installed: false, version: null };
      }
    }

    res.json({ sandboxRunning: true, sandboxName: running.name, results });
  } catch (err) {
    log.error('detect failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sandbox/toolchains/install
 * Body: { id: string }
 * Runs the install command for one CLI in the active sandbox (session only).
 * Won't survive a rebuild unless "Bake in" is also toggled and saved.
 */
sandboxRouter.post('/sandbox/toolchains/install', requireSystemAdmin, async (req, res) => {
  const { id } = req.body;
  const tool = TOOLCHAIN_REGISTRY[id];
  if (!tool) return res.status(400).json({ error: `Unknown tool: ${id}` });

  try {
    const running = await findRunningSandbox();

    if (!running) {
      return res.status(409).json({
        error: 'No running sandbox. Open a terminal window first to start it.',
      });
    }

    log.info('quick-installing CLI in sandbox', { tool: id, sandbox: running.name });

    const { stdout, stderr, code } = await runnerClient.exec(
      'docker',
      ['exec', running.name, 'bash', '-lc', tool.installCmd],
      { windowsHide: true, timeout: 300_000, maxBuffer: 20 * 1024 * 1024 }
    );

    res.json({
      ok: code === 0,
      code,
      stdout: stdout || '',
      stderr: stderr || '',
      note: code === 0
        ? `${tool.label} installed for this session. Toggle "Bake in" to make it permanent.`
        : `Install failed with exit code ${code}.`,
    });
  } catch (err) {
    log.error('quick-install failed', { tool: id, error: err.message });
    res.status(500).json({ error: err.message });
  }
});
