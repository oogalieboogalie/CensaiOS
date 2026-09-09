import fs from 'fs';
import path from 'path';
import { resolveLocalProjectRoot } from '../helpers.js';
import { runnerClient } from '../../runner/client.js';

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

export async function resolveRunnerContext(agentId, args = {}, taskContext = {}) {
  const projectPath = args.project_path || args.projectPath;
  if (projectPath) {
    const resolved = path.resolve(projectPath);
    if (await pathExists(path.join(resolved, 'package.json'))) return { cwd: resolved, scopedPath: args.path || '.' };
    const root = await resolveLocalProjectRoot(agentId, projectPath, taskContext);
    return { cwd: root, scopedPath: args.path || '.' };
  }
  const projectName = args.project || args.project_name || args.projectName;
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
