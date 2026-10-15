import fs from 'fs';
import os from 'os';
import path from 'path';
import { gitError, startVersions } from './git.js';
import { slugify } from './publish.js';

// "New project" in the top-left project menu: an empty folder of its own in
// the projects folder, with a README and version saving already on.
//
// CENSAI_PROJECTS_FOLDER     where new projects are made, as this server
//                            sees it (Docker: /workspace/projects).
// CENSAI_PROJECTS_FOLDER_ON_PC  the same folder as the person sees it on
//                            their PC (D:\Projects), so headers and paths
//                            read in their own words. Optional.

export function projectsHome(env = process.env) {
  return env.CENSAI_PROJECTS_FOLDER || path.join(os.homedir(), 'censai-projects');
}

/** The new folder's path as the board should store and show it. */
export function shownProjectPath(slug, env = process.env) {
  const onPc = String(env.CENSAI_PROJECTS_FOLDER_ON_PC || '').trim();
  if (onPc && env.CENSAI_PROJECTS_FOLDER) {
    const sep = /^[a-z]:[\\/]|\\/i.test(onPc) ? '\\' : '/';
    return `${onPc.replace(/[\\/]+$/, '')}${sep}${slug}`;
  }
  return path.join(projectsHome(env), slug);
}

const README = (name) => `# ${name}\n\nMade on the censaiOS board.\n`;
// .team/ holds the board agents' own notes about the project.
const GITIGNORE = 'node_modules/\n.env\ndist/\n.team/\n';

export async function createNewProject({ name, author, env = process.env } = {}) {
  const title = String(name || '').trim().slice(0, 80);
  if (!title) throw gitError('Give the project a name.');
  const slug = slugify(title);
  const home = projectsHome(env);
  const folder = path.join(home, slug);
  await fs.promises.mkdir(home, { recursive: true });
  try {
    await fs.promises.mkdir(folder);
  } catch (err) {
    if (err.code === 'EEXIST') throw gitError(`A project called ${slug} already exists. Pick it from the list, or use another name.`, 409);
    throw err;
  }
  await fs.promises.writeFile(path.join(folder, 'README.md'), README(title));
  await fs.promises.writeFile(path.join(folder, '.gitignore'), GITIGNORE);
  await startVersions(folder, { author });
  return { name: title, path: shownProjectPath(slug, env) };
}
