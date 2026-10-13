/**
 * server/tools/handlers/vex.js
 *
 * Vex Orchestration Tool Handler
 * Allows Censai family agents to trigger and monitor Vex orchestration runs via chat.
 *
 * Tools:
 *   vex_run          — Trigger a Vex orchestration run
 *   vex_status       — Get status/results of a run
 *   vex_list_agents  — List registered Vex agents from the registry
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { runnerClient } from '../../runner/client.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const REGISTRY_PATH = path.join(REPO_ROOT, 'vex', 'data', 'registry', 'registry.json');
const RUNS_DIR = path.join(REPO_ROOT, 'vex', 'logs', 'runs');
const ORCHESTRATOR_PATH = path.join(REPO_ROOT, 'vex', 'lib', 'agents', 'orchestrator.js');

// Shared in-memory run cache (same as vex route)
const runCache = new Map();

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { agents: [] };
  try { return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')); }
  catch { return { agents: [] }; }
}

function readRunFile(runId, filename) {
  if (!/^run_\d+_[a-z0-9]+$/.test(runId)) return null;
  const p = path.join(RUNS_DIR, runId, filename);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export async function handleVexTool(agentId, name, args) {
  switch (name) {

    case 'vex_run': {
      const task = String(args.task || 'demo');
      const payload = args.payload || {};
      const filter = args.filter || null;

      // In runner mode, we assume the runner has the same REPO_ROOT structure
      // or at least access to the orchestrator.js at the same relative path.

      const env = {
        ...process.env,
        VEX_TASK: task,
        VEX_PAYLOAD: JSON.stringify(payload),
        VEX_FILTER: filter || '',
      };

      const result = await runnerClient.exec(process.execPath, [ORCHESTRATOR_PATH], {
        cwd: REPO_ROOT,
        env,
      });

      const stdoutBuffer = result.stdout;
      const stderrBuffer = result.stderr;
      const code = result.code;

      let runId = null;
      const match = stdoutBuffer.match(/run:\s*(run_\d+_[a-z0-9]+)/);
      if (match) {
        runId = match[1];
      }

      if (runId) {
        const meta = readRunFile(runId, 'run_meta.json');
        const succeeded = meta?.agents_succeeded ?? 0;
        const total = meta?.agents_dispatched ?? 0;
        return (
          `✓ Vex run complete: ${succeeded}/${total} agents succeeded.\n` +
          `Run ID: ${runId}\n` +
          `Log: vex/logs/runs/${runId}/\n` +
          `Use vex_status with this run ID to see the full aggregated results.`
        );
      } else {
        const status = code === 0 ? 'complete' : 'failed';
        return (
          `Vex run ${status}. Exit code: ${code}.\n` +
          `Log preview:\n${stdoutBuffer.slice(-800)}\n${stderrBuffer.slice(-400)}`
        );
      }
    }

    case 'vex_status': {
      const runId = String(args.run_id || '');
      if (!runId || !/^run_\d+_[a-z0-9]+$/.test(runId)) {
        return 'Invalid run_id. Provide a run ID returned by vex_run (format: run_<timestamp>_<hash>).';
      }

      const meta = readRunFile(runId, 'run_meta.json');
      const aggregate = readRunFile(runId, 'aggregate.json');
      if (!meta) {
        const cached = runCache.get(runId);
        if (cached) {
          return `Run ${runId} is still ${cached.status}. Started: ${cached.startedAt}`;
        }
        return `Run ${runId} not found. Check vex/logs/runs/ or try a more recent run.`;
      }

      const lines = [
        `**Vex Run: ${runId}**`,
        `Task: ${meta.task || 'unknown'}`,
        `Status: ${meta.completed_at ? '✓ complete' : '⏳ running'}`,
        `Started: ${meta.started_at}`,
        meta.completed_at ? `Completed: ${meta.completed_at}` : '',
        `Agents dispatched: ${meta.agents_dispatched ?? 0}`,
        `Agents succeeded: ${meta.agents_succeeded ?? 0}`,
      ].filter(Boolean);

      if (meta.agents?.length) {
        lines.push('\n**Per-agent results:**');
        for (const a of meta.agents) {
          const status = a.success ? `✓ ${a.duration_ms}ms` : `✗ ${a.error || `exit ${a.exit_code}`}`;
          lines.push(`  • ${a.agent_name}: ${status}`);
        }
      }

      if (aggregate && Object.keys(aggregate).length > 0) {
        const summary = JSON.stringify(aggregate, null, 2).slice(0, 1200);
        lines.push(`\n**Aggregated result (preview):**\n\`\`\`json\n${summary}\n\`\`\``);
      }

      if (meta.conflicts?.length) {
        lines.push(`\n**Conflicts detected:** ${meta.conflicts.length} key(s) overwritten (last-write-wins)`);
      }

      return lines.join('\n');
    }

    case 'vex_list_agents': {
      const registry = loadRegistry();
      const agents = registry.agents || [];

      if (agents.length === 0) {
        return 'No agents registered in the Vex registry. Check vex/data/registry/registry.json.';
      }

      const lines = [`**Vex Agent Registry** (${agents.length} agent${agents.length !== 1 ? 's' : ''})`];
      for (const a of agents) {
        const status = a.degraded ? '⚠ degraded' : '✓ active';
        const caps = (a.capabilities || []).join(', ') || (a.tags || []).join(', ') || '—';
        lines.push(`\n**${a.name}** v${a.version} [${a.type}] ${status}`);
        lines.push(`  ${a.description || 'No description.'}`);
        lines.push(`  Capabilities: ${caps} | Owner: ${a.owner || '—'} | Timeout: ${a.timeout_ms}ms`);
      }
      return lines.join('\n');
    }

    default:
      return `Unknown Vex tool: ${name}`;
  }
}
