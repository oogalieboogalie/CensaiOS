// A terminal may start only inside the projects folder. Anywhere else
// (a home directory, a link that steps out) is refused, so a shared board
// cannot choose the folder a sandbox mounts.
import fs from 'fs';
import path from 'path';
import { projectsHome } from '../projectGit/newProject.js';

export function projectsRootDir(env = process.env) {
  return path.resolve(projectsHome(env));
}

function realDir(dir) {
  try {
    const real = fs.realpathSync(dir);
    return fs.statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

/** True when `dir` exists and its real path stays inside the projects folder. */
export function directoryInsideProjectsRoot(dir, env = process.env) {
  const root = realDir(projectsRootDir(env));
  const target = realDir(dir);
  if (!root || !target) return false;
  const rel = path.relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}
