import { execFile } from 'child_process';
import fs from 'fs';
import { gitError } from './git.js';
import { keptOutName } from './keptOut.js';
import { keptOutAdded } from './publish.js';

// Before a branch moves to the versions made again without files that hold
// keys (./makeAgain.js), each of them is checked against the version it was
// made from: the same message, names and times; made on the same versions,
// or on the ones made again from them; and the same files, but for the ones
// versions keep out, which none of them holds. Anything else stops it.

export const UNSAFE = 'Those versions could not be made again safely, so nothing changed.';
const TIMEOUT_MS = 300_000;
// How git reads and writes the versions, whatever the person's own git settings say.
export const AS_IS = ['-c', 'safe.directory=*', '-c', 'core.quotePath=false', '-c', 'core.ignoreCase=false', '--no-replace-objects'];
// A version's own lines that change when it is made again: its files, its parents, and a signature that could no longer match.
const MADE_ANEW = /^(?:tree|parent|gpgsig|gpgsig-sha256|mergetag) /;

const unsafe = () => gitError(UNSAFE, 500);

/** git's answer as its own bytes, so a name in any encoding goes back to git as it is; `input` goes to it first. */
export function gitBytes(cwd, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile('git', [...AS_IS, ...args], {
      cwd, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, timeout: TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    if (input !== undefined) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
  });
}

/** The pieces of git's -z answer, each ended by a NUL. */
function nulParts(raw) {
  const parts = [];
  for (let at = 0, end = raw.indexOf(0); end >= 0; at = end + 1, end = raw.indexOf(0, at)) parts.push(raw.subarray(at, end));
  return parts;
}

/** Each version and the one made from it, from the marks fast-export and fast-import wrote (":<mark> <object id>", a line each). */
function pairsFrom(oldMarks, madeMarks) {
  const read = (file) => new Map(fs.readFileSync(file, 'latin1').split('\n').filter(Boolean).map((line) => line.split(' ')));
  const made = read(madeMarks);
  return [...read(oldMarks)].map(([mark, old]) => [old, made.get(mark)]);
}

/** Each commit's parents, and the rest of it but for the lines that change when it is made again, by object id. */
async function commitsOf(top, shas) {
  const raw = await gitBytes(top, ['cat-file', '--batch'], shas.map((sha) => `${sha}\n`).join(''));
  const found = new Map();
  for (let at = 0; at < raw.length;) {
    const eol = raw.indexOf(0x0a, at);
    const [sha, type, size] = raw.subarray(at, eol).toString('latin1').split(' ');
    if (type !== 'commit') throw unsafe();
    const body = raw.subarray(eol + 1, eol + 1 + Number(size));
    at = eol + 2 + Number(size);
    const split = body.indexOf('\n\n');
    const parents = [];
    const kept = [];
    let anew = false;
    for (const line of (split < 0 ? body : body.subarray(0, split)).toString('latin1').split('\n')) {
      // A line that starts with a space goes on with the one before it.
      if (!line.startsWith(' ')) anew = MADE_ANEW.test(line);
      if (line.startsWith('parent ')) parents.push(line.slice(7));
      if (!anew) kept.push(line);
    }
    found.set(sha, { parents: parents.join(' '), rest: Buffer.concat([Buffer.from(kept.join('\n'), 'latin1'), split < 0 ? Buffer.alloc(0) : body.subarray(split)]) });
  }
  return found;
}

/** Each version made again may differ from its own only by not holding a file versions keep out. */
async function onlyKeptOutTakenOut(top, pairs) {
  // A line "<made> <old>" compares the two as if the old one were the other's parent.
  const parts = nulParts(await gitBytes(top, ['diff-tree', '--stdin', '-r', '-z', '--no-renames'], pairs.map(([old, made]) => `${made} ${old}\n`).join('')));
  for (let at = 0; at < parts.length; at += 1) {
    if (parts[at][0] !== 0x3a) continue; // the id of the version made again, before how it differs
    const mode = parts[at].toString('latin1').split(' ')[1];
    at += 1;
    if (mode !== '000000' || !parts[at] || !keptOutName(parts[at])) throw unsafe();
  }
}

/** How `made` differs from `head`: each file with its new mode and object (0s, since it is gone). */
async function tipChanges(top, head, made) {
  const parts = nulParts(await gitBytes(top, ['diff-tree', '-r', '-z', '--no-renames', head, made]));
  const changed = [];
  for (let at = 0; at + 1 < parts.length; at += 2) {
    const [, mode, object] = /^:\d+ (\d+) [0-9a-f]+ ([0-9a-f]+) /.exec(parts[at].toString('latin1')) || [];
    if (!mode) throw unsafe();
    changed.push({ mode, object, path: parts[at + 1] });
  }
  return changed;
}

/**
 * Checks the versions made again (`marks`: the files that pair each old
 * version with the one made from it; `versions` of them, `head` made into
 * `made`) before the branch moves to them, and answers how the last one
 * differs from `head`.
 */
export async function checkMadeAgain(top, { marks, versions, head, made, notSent }) {
  const pairs = pairsFrom(marks.old, marks.made);
  if (pairs.length !== versions || pairs.some(([old, again]) => !old || !again)) throw unsafe();
  const madeFrom = new Map(pairs);
  if (madeFrom.get(head) !== made) throw unsafe();
  const commits = await commitsOf(top, pairs.flat());
  for (const [old, again] of pairs) {
    const was = commits.get(old);
    const now = commits.get(again);
    if (!was || !now || !was.rest.equals(now.rest)) throw unsafe();
    if (was.parents.split(' ').map((parent) => madeFrom.get(parent) || parent).join(' ') !== now.parents) throw unsafe();
  }
  await onlyKeptOutTakenOut(top, pairs);
  if ((await keptOutAdded(top, [made, ...notSent])).length) throw unsafe();
  return tipChanges(top, head, made);
}
