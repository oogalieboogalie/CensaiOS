import fs from 'fs';
import path from 'path';
import pool from '../../db.js';
import { resolveLocalProjectRoot, resolveProjectForCall } from '../helpers.js';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import { runnerClient } from '../../runner/client.js';
import { jobProjectFor } from '../jobProject.js';

export const PROJECT_ROOT = process.cwd();
export const MAX_OUTPUT = 5000;
const MAX_BUFFER = 10 * 1024 * 1024;
const USE_SHELL = process.platform === 'win32';

export function truncate(str, max = MAX_OUTPUT) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n... [truncated at ${max} chars]`;
}

export async function readPackageJson(cwd = PROJECT_ROOT) {
  try {
    const raw = await fs.promises.readFile(path.join(cwd, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function formatResult(label, exitCode, stdout, stderr) {
  const parts = [];
  if (stdout && stdout.trim()) parts.push(`STDOUT:\n${stdout.trim()}`);
  if (stderr && stderr.trim()) parts.push(`STDERR:\n${stderr.trim()}`);
  return [`${label}`, `Exit code: ${exitCode}`, parts.join('\n\n') || '(no output)'].join('\n');
}

export async function runCommand(command, args, options = {}) {
  return runnerClient.exec(command, args, { maxBuffer: MAX_BUFFER, ...options, shell: USE_SHELL, windowsHide: true });
}

export async function resolveLocalBin(name, cwd = PROJECT_ROOT) {
  const candidates = process.platform === 'win32' ? [`${name}.cmd`, name] : [name];
  for (const candidate of candidates) {
    const bin = path.join(cwd, 'node_modules', '.bin', candidate);
    const exists = await fs.promises.access(bin).then(() => true).catch(() => false);
    if (exists) return bin;
  }
  return null;
}

export async function pathExists(targetPath) {
  return fs.promises.access(targetPath).then(() => true).catch(() => false);
}

/** True when `inner` is `outer` or a folder inside it. */
const inside = (inner, outer) => inner === outer || inner.startsWith(outer + path.sep);

// A folder given by its path runs under the same rules as a project given by
// its name: it has to be this app's own folder (the default below) or lie in a
// project this agent may work in here. The project is found by the folder it
// is in, then checked like any named project (the board's list, read only,
// the family's past), so a path never gets around those.
async function folderInAProject(agentId, folder, taskContext) {
  if (inside(folder, PROJECT_ROOT)) return folder;
  const { rows } = await pool.query("SELECT id, path FROM projects WHERE path IS NOT NULL AND path <> ''");
  const holding = rows
    .map((row) => ({ id: row.id, root: resolveProjectPathForRuntime(row.path) }))
    .filter((row) => inside(folder, row.root))
    .sort((a, b) => b.root.length - a.root.length)[0];
  if (!holding) {
    throw Object.assign(new Error(`"${folder}" is not inside a project open on this computer. Name the project, or open that folder as a project first.`), { statusCode: 403 });
  }
  await resolveProjectForCall(agentId, holding.id, taskContext);
  return folder;
}

export async function resolveRunnerContext(agentId, args = {}, taskContext = {}) {
  const projectPath = args.project_path || args.projectPath;
  if (projectPath) {
    const resolved = path.resolve(projectPath);
    if (await pathExists(path.join(resolved, 'package.json'))) {
      return { cwd: await folderInAProject(agentId, resolved, taskContext), scopedPath: args.path || '.' };
    }
    const root = await resolveLocalProjectRoot(agentId, projectPath, taskContext);
    return { cwd: root, scopedPath: args.path || '.' };
  }
  // On a job Censai handed off, no name means the job's project, where its saves went (jobProject.js).
  const projectName = args.project || args.project_name || args.projectName || jobProjectFor(agentId);
  if (projectName) {
    const root = await resolveLocalProjectRoot(agentId, projectName, taskContext);
    return { cwd: root, scopedPath: args.path || '.' };
  }
  return { cwd: PROJECT_ROOT, scopedPath: args.path || '.' };
}

export async function resolveLinterContext(agentId, args = {}, taskContext = {}) {
  const context = await resolveRunnerContext(agentId, args, taskContext);
  const scopedPath = context.scopedPath || '.';
  if (scopedPath === '.') return context;
  const candidate = path.isAbsolute(scopedPath) ? scopedPath : path.resolve(context.cwd, scopedPath);
  if (await pathExists(candidate)) return context;
  // Agents often pass the project name in `path`. Treat a non-existent lint
  // path as a project lookup before handing it to eslint as a bad file path.
  const root = await resolveLocalProjectRoot(agentId, scopedPath, taskContext).catch(() => null);
  if (root) return { cwd: root, scopedPath: '.' };
  return context;
}
