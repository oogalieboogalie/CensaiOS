import { isDockerAvailable, ensureSandbox, execInSandbox } from '../../sandbox/index.js';
import { resolveLocalProjectRoot } from '../helpers.js';

const PROJECT_ROOT = process.cwd();
const MAX_OUTPUT = 8000;
const DEFAULT_TIMEOUT = 120_000;
const MAX_TIMEOUT = 600_000;

function truncate(str, max = MAX_OUTPUT) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n... [truncated at ${max} chars]`;
}

function formatResult(label, code, stdout, stderr) {
  const parts = [];
  const out = truncate((stdout || '').trim());
  const err = truncate((stderr || '').trim());
  if (out) parts.push(`STDOUT:\n${out}`);
  if (err) parts.push(`STDERR:\n${err}`);
  return [label, `Exit code: ${code}`, parts.join('\n\n') || '(no output)'].join('\n');
}

// Resolve which host directory backs the sandbox for this call.
async function resolveHostPath(agentId, args = {}, context = {}) {
  const projectPath = args.project_path || args.projectPath;
  if (projectPath) return projectPath;

  const projectName = args.project || args.project_name || args.projectName;
  if (projectName) {
    const root = await resolveLocalProjectRoot(agentId, projectName, context);
    if (root) return root;
  }
  return PROJECT_ROOT;
}

export async function handleSandboxTool(agentId, name, args, context = {}) {
  switch (name) {
    case 'sandbox_exec': {
      const command = (args.command || '').trim();
      if (!command) return 'Error: sandbox_exec requires a non-empty "command".';

      if (!await isDockerAvailable()) {
        return 'Sandbox unavailable: Docker is not running on this host. Start Docker Desktop (or the Docker daemon) and try again. On a containerized server deploy, mount the Docker socket into the app container.';
      }

      let hostPath;
      try {
        hostPath = await resolveHostPath(agentId, args, context);
      } catch (err) {
        return `sandbox_exec could not resolve a project directory: ${err.message}`;
      }

      const timeoutMs = Math.min(Math.max(Number(args.timeout_ms) || DEFAULT_TIMEOUT, 1000), MAX_TIMEOUT);

      try {
        // Surface a clear message the first time an image build / container
        // create has to happen (can take a while on a cold host).
        const { name: container, created } = await ensureSandbox(hostPath);
        const result = await execInSandbox(hostPath, command, {
          cwd: args.cwd,
          timeoutMs,
        });
        const header = `SANDBOX EXEC — ${container}${created ? ' (newly started)' : ''}\n$ ${command}`;
        return formatResult(header, result.code, result.stdout, result.stderr);
      } catch (err) {
        if (err.timedOut) return `sandbox_exec: ${err.message}. Increase timeout_ms (max ${MAX_TIMEOUT}) or run a shorter command.`;
        return `sandbox_exec failed: ${err.message}`;
      }
    }

    default:
      throw new Error(`Unknown sandbox tool: ${name}`);
  }
}
