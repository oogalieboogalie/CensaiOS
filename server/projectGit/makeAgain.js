import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transform, pipeline } from 'stream';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { gitError, projectStatus, runGit } from './git.js';
import { keptOutName } from './keptOut.js';
import { AS_IS, UNSAFE, checkMadeAgain } from './madeAgainCheck.js';
import { githubClient, keptOutAdded, keptOutGithubHolds, whatGithubHas } from './publish.js';

// "Make those versions again without them", which Send to GitHub offers when
// the versions it would add to GitHub hold a file that holds keys or
// passwords (./keptOut.js). Those versions are made again (git fast-export,
// then fast-import) holding no such file at all, the ones the versions GitHub
// has hold included. Every other file, and each version's message, names and
// times, stay as they were; versions GitHub already has are never made
// again, and the files themselves stay on this computer as they are. The
// branch moves to the new versions only when no version was saved meanwhile
// and each checks out against the one it was made from (./madeAgainCheck.js).

const log = createLogger('project-git');
// Where the new versions wait until the branch moves to them.
const MADE_REF = 'refs/censai/made-again';
const TIMEOUT_MS = 300_000;
const ESCAPED = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };

/** A path as fast-export writes it, as bytes: in quotes, with C escapes, when it must be. */
export function unquotedPath(raw) {
  if (raw[0] !== 0x22) return raw;
  const out = [];
  for (let at = 1; at < raw.length && raw[at] !== 0x22; at += 1) {
    if (raw[at] !== 0x5c) out.push(raw[at]);
    else if (raw[at + 1] >= 0x30 && raw[at + 1] <= 0x37) {
      out.push(parseInt(raw.subarray(at + 1, at + 4).toString('latin1'), 8) & 0xff);
      at += 3;
    } else {
      at += 1;
      out.push(ESCAPED[String.fromCharCode(raw[at])] ?? raw[at]);
    }
  }
  return Buffer.from(out);
}

/** True for a fast-export line that puts a file versions keep out in a version: M <mode> <object> <path>. */
function changesKeptOut(line) {
  if (line[0] !== 0x4d || line[1] !== 0x20) return false;
  const mode = line.indexOf(0x20, 2);
  const object = mode < 0 ? -1 : line.indexOf(0x20, mode + 1);
  return object > 0 && keptOutName(unquotedPath(line.subarray(object + 1, line.length - 1)));
}

/**
 * Passes a fast-export stream (--no-data --full-tree: each version starts
 * from nothing, deleteall, and lists every file it holds) on without the
 * files versions keep out, so no version made from it holds one. A message
 * passes as it is, whatever its lines look like.
 */
export function withoutKeptOut() {
  let rest = Buffer.alloc(0);
  let message = 0;
  return new Transform({
    transform(chunk, encoding, done) {
      let data = rest.length ? Buffer.concat([rest, chunk]) : chunk;
      const out = [];
      while (data.length) {
        if (message) {
          const part = data.subarray(0, message);
          out.push(part);
          message -= part.length;
          data = data.subarray(part.length);
          continue;
        }
        const end = data.indexOf(0x0a);
        if (end < 0) break;
        const line = data.subarray(0, end + 1);
        data = data.subarray(end + 1);
        if (line.subarray(0, 5).toString('latin1') === 'data ') {
          message = Number(line.subarray(5, end).toString('latin1'));
          if (!Number.isSafeInteger(message) || message < 0) return done(new Error('fast-export wrote a message it cannot read back'));
        }
        if (!changesKeptOut(line)) out.push(line);
      }
      rest = Buffer.from(data);
      return done(null, Buffer.concat(out));
    },
    flush(done) {
      done(rest.length || message ? new Error('fast-export stopped in the middle of a line') : null);
    },
  });
}

/** Makes `range` (a branch, then what to leave out) again through fast-export and fast-import without files versions keep out; the new versions end at MADE_REF, and `marks` name each old version and the one made from it. */
function exportAgain(top, range, marks) {
  // A signed version is made again unsigned: its signature could not match it anyway.
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', FAST_EXPORT_SIGNED_COMMITS_NOABORT: '1' };
  const run = (args, stdio) => spawn('git', [...AS_IS, ...args], { cwd: top, env, stdio, timeout: TIMEOUT_MS });
  // Every version lists all of its files (--full-tree), so none can lose one to the order git lists changes in.
  const exporter = run(['fast-export', '--no-data', '--full-tree', '--reference-excluded-parents', '--reencode=no', '--use-done-feature',
    `--export-marks=${marks.old}`, `--refspec=${range[0]}:${MADE_REF}`, ...range], ['ignore', 'pipe', 'pipe']);
  const importer = run(['fast-import', '--quiet', `--export-marks=${marks.made}`], ['pipe', 'ignore', 'pipe']);
  const ended = [exporter, importer].map((child) => new Promise((resolve) => {
    child.stderr.resume();
    child.on('error', (err) => resolve(err));
    child.on('close', (code) => resolve(code));
  }));
  const piped = new Promise((resolve) => pipeline(exporter.stdout, withoutKeptOut(), importer.stdin, resolve));
  return Promise.all([...ended, piped]).then(([exported, imported, err]) => {
    if (exported !== 0 || imported !== 0 || err) throw Object.assign(new Error('git failed'), { git: true, code: err?.code || 'git_failed' });
  });
}

/** True while git is in the middle of a merge, cherry-pick, revert or rebase in this repository. */
async function halfDone(top) {
  const names = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'];
  const paths = (await runGit(top, ['rev-parse', ...names.flatMap((name) => ['--git-path', name])])).split('\n').filter(Boolean);
  return paths.some((name) => fs.existsSync(path.resolve(top, name)));
}

/** Brings the index's entries for `changed` (files versions keep out) to the new versions; the files themselves stay as they are. */
async function matchIndex(top, changed) {
  if (!changed.length) return;
  const input = Buffer.concat(changed.flatMap(({ mode, object, path: name }) => [Buffer.from(`${mode} ${object}\t`, 'latin1'), name, Buffer.from([0])]));
  await runGit(top, ['update-index', '-z', '--index-info'], { input });
}

const utf8 = (names) => names.map((name) => name.toString('utf8'));

/**
 * Makes again the versions of this folder's branch that GitHub does not have
 * yet, holding no file versions keep out; answers how many versions, the
 * files they no longer hold, and the folder's status.
 */
export async function makeVersionsAgain(cwd, { token, octokit } = {}) {
  const status = await projectStatus(cwd);
  if (!status.tracked) throw gitError('Start saving versions for this folder first.');
  const top = status.root;
  const branch = (await runGit(top, ['symbolic-ref', '-q', 'HEAD']).catch(() => '')).trim();
  if (!branch.startsWith('refs/heads/')) throw gitError('These versions are on no branch, so censaiOS cannot make them again.');
  const tip = async () => (await runGit(top, ['--no-replace-objects', 'rev-parse', '--verify', '-q', `${branch}^{commit}`]).catch(() => '')).trim();
  const head = await tip();
  if (!head) throw gitError('Save a version first: there is nothing to make again.');
  // A merge left half done would bring the old versions back.
  if (await halfDone(top)) throw gitError('Git is in the middle of a merge or a rebase in this folder. Finish or stop it first, then make the versions again.', 409);
  const { sent } = await whatGithubHas(cwd, status, { token, gh: githubClient(token, octokit) });
  const notSent = sent.length ? ['--not', ...sent] : [];
  const added = utf8(await keptOutAdded(top, [head, ...notSent]));
  if (!added.length) throw gitError('Nothing to make again: the versions GitHub does not have yet hold no file that can hold keys.', 409);
  const files = [...new Set([...added, ...(sent.length ? utf8(await keptOutGithubHolds(top, [head, ...notSent])) : [])])];
  const versions = Number(await runGit(top, ['--no-replace-objects', 'rev-list', '--count', head, ...notSent])) || 0;
  const meanwhile = () => gitError('A version was saved meanwhile, so nothing was made again. Try again.', 409);
  const stopped = (what) => (err) => {
    log.warn(what, { code: safeErrorCode(err) });
    throw err?.status ? err : gitError(UNSAFE, 500);
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-made-again-'));
  const marks = { old: path.join(dir, 'old'), made: path.join(dir, 'made') };
  await runGit(top, ['update-ref', '-d', MADE_REF]).catch(() => {});
  try {
    await exportAgain(top, [branch, ...notSent], marks).catch(stopped('making versions again stopped'));
    if (await tip() !== head) throw meanwhile();
    const made = (await runGit(top, ['rev-parse', '--verify', '-q', `${MADE_REF}^{commit}`])).trim();
    const changed = await checkMadeAgain(top, { marks, versions, head, made, notSent })
      .catch(stopped('versions made again did not check out, so nothing changed'));
    await runGit(top, ['update-ref', '-m', 'censaiOS: versions made again without files that can hold keys', branch, made, head]).catch(() => { throw meanwhile(); });
    // The branch has moved; should git be busy with the index just then, the next save puts it right (leaveKeptOut).
    await matchIndex(top, changed).catch((err) => log.warn('index not matched to the versions made again', { code: safeErrorCode(err) }));
  } finally {
    await runGit(top, ['update-ref', '-d', MADE_REF]).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
  log.info('versions made again without files that can hold keys', { versions, files: files.length });
  return { made: versions, files, status: await projectStatus(cwd) };
}
