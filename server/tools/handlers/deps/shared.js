import fs from 'fs';
import path from 'path';
import { resolveLocalProjectRoot } from '../../helpers.js';

export async function readJsonFile(filePath) {
  const raw = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function pathExists(targetPath) {
  return fs.promises.access(targetPath).then(() => true).catch(() => false);
}

// A project named by an agent is looked up for whoever drives its chat (`context`),
// as every project tool does (server/tools/helpers.js).
export async function resolveDepsProjectPath(agentId, args = {}, context = {}) {
  const projectPath = args.project_path || args.projectPath;
  const projectName = args.project || args.project_name || args.projectName;

  if (projectPath) {
    const resolved = path.resolve(projectPath);
    if (await pathExists(path.join(resolved, 'package.json'))) return resolved;
    const projectRoot = await resolveLocalProjectRoot(agentId, projectPath, context).catch(() => null);
    if (projectRoot) return projectRoot;
    return resolved;
  }

  if (projectName) {
    return resolveLocalProjectRoot(agentId, projectName, context);
  }

  return process.cwd();
}
