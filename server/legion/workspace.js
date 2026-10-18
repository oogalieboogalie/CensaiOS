// Legion: the folder a run builds in. Each run gets its own project folder
// under the app's state folder (it survives restarts and Docker rebuilds),
// next to its screenshots and its saved log.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { LOCAL_STATE_DIR } from '../routes/files/pathUtils.js';
import { safeRelativePath } from './parse.js';

const run = promisify(execFile);
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const PROMPT_FILE_LIMIT = 60_000;

export function legionRoot(env = process.env) {
  return env.CENSAI_LEGION_DIR ? path.resolve(env.CENSAI_LEGION_DIR) : path.join(LOCAL_STATE_DIR, 'legion');
}

const userKey = (userId) => String(userId).replace(/[^\w-]/g, '_').slice(0, 80) || 'anyone';

export function runFolder(userId, runId, root = legionRoot()) {
  return path.join(root, userKey(userId), String(runId).replace(/[^\w-]/g, ''));
}

export async function makeRunFolders(dir) {
  await fs.mkdir(path.join(dir, 'project'), { recursive: true });
  await fs.mkdir(path.join(dir, 'shots'), { recursive: true });
}

/** Write a builder's files. Returns the paths written. */
export async function writeFiles(projectDir, files) {
  const written = [];
  for (const file of files) {
    const rel = safeRelativePath(file.path);
    if (!rel) continue;
    const target = path.join(projectDir, rel);
    if (!target.startsWith(projectDir + path.sep)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, 'utf8');
    written.push(rel);
  }
  return written;
}

/** Every file in the project, as relative paths, sorted. */
export async function listFiles(projectDir, sub = '') {
  const out = [];
  let entries = [];
  try { entries = await fs.readdir(path.join(projectDir, sub), { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const rel = sub ? `${sub}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...await listFiles(projectDir, rel));
    } else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

/** The project's files as one text block for a prompt, cut to a budget. */
export async function filesForPrompt(projectDir, limit = PROMPT_FILE_LIMIT) {
  const files = await listFiles(projectDir);
  if (!files.length) return 'The project is empty so far.';
  let budget = limit;
  const parts = [`Files so far: ${files.join(', ')}`];
  for (const rel of files) {
    if (budget <= 0) { parts.push(`(${rel} and later files left out to save space)`); break; }
    let content = '';
    try { content = await fs.readFile(path.join(projectDir, rel), 'utf8'); } catch { continue; }
    const numbered = content.split('\n').map((line, i) => `${i + 1}| ${line}`).join('\n').slice(0, budget);
    budget -= numbered.length;
    parts.push(`=== ${rel}\n${numbered}`);
  }
  return parts.join('\n\n');
}

/**
 * Commit the project with git. Returns { committed, sha, error }. A computer
 * without git still keeps the files; the run says so instead of failing.
 */
export async function commitProject(projectDir, message) {
  const git = (...args) => run('git', args, { cwd: projectDir, timeout: 30_000 });
  try {
    await git('init', '-q');
    await git('add', '-A');
    await git('-c', 'user.name=Legion', '-c', 'user.email=legion@censai.local', 'commit', '-q', '--allow-empty', '-m', message.slice(0, 300));
    const { stdout } = await git('rev-parse', '--short', 'HEAD');
    return { committed: true, sha: stdout.trim() };
  } catch (error) {
    return { committed: false, sha: null, error: error.code === 'ENOENT' ? 'git is not installed on this computer' : String(error.message || error).slice(0, 200) };
  }
}

export async function saveJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

export async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

/** What earlier Legions learned (newest first), for the next Architect. */
export async function pastLessons(userDir, limit = 3) {
  let runs = [];
  try { runs = await fs.readdir(userDir); } catch { return []; }
  const lessons = [];
  for (const id of runs.sort().reverse()) {
    const saved = await readJson(path.join(userDir, id, 'run.json'));
    if (saved?.reflection?.learned) lessons.push(saved.reflection.learned);
    if (lessons.length >= limit) break;
  }
  return lessons;
}
