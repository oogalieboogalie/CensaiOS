import { keptOutChangedIn } from './keptOut.js';

// The files versions keep out (./keptOut.js) that the versions GitHub has
// hold: sent before censaiOS left such files out, or pushed by a terminal or
// an agent with plain git. GitHub keeps every version it has, even one whose
// branch is gone (a pull request keeps it), so the version bar names them and
// says to make new keys, and a name once seen stays: the repository keeps it
// in its own settings (censai.githubKeeps). What GitHub has is this
// repository's own word of it (origin's branches as the last send, fetch or
// push left them), so the bar never waits on GitHub. Once the person says
// they made new keys for some of them ("Done, I made new keys", ./newKeys.js)
// those are put away (censai.githubKeepsDone, with origin's branches then)
// until a version GitHub gets after that adds or changes one: GitHub would
// then have the new keys too, so that file comes back for good.

// How long the bar waits for a new answer; a longer history answers at a later look.
const WAIT_MS = 2_000;
// How long git may read a history, out of the bar's way.
const READ_MS = 300_000;
// A read git could not finish is tried again after this, or once the branches move.
const RETRY_MS = 600_000;
// Reads kept, two per repository (all of origin's history, and what came after new keys), the oldest dropped first.
const KEPT = 100;
const known = new Map();
// A version's id as git writes it (SHA-1 or SHA-256): nothing else from the settings reaches git.
const VERSION_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/** Starts reading what the versions git lists for `revs` add or change, kept under `slot`, unless that read (for `tips`) is done or under way. */
function readFor(slot, top, tips, revs) {
  const had = known.get(slot);
  if (had?.tips === tips && !(had.failed && Date.now() - had.failed > RETRY_MS)) return had;
  // Names from other branches never stand for these: the names kept carry over instead.
  const read = { tips, found: [] };
  read.done = keptOutChangedIn(top, revs, { timeout: READ_MS }).then((found) => {
    read.found = found.map((name) => name.toString('utf8'));
    read.finished = true;
  }, () => { read.failed = Date.now(); });
  known.delete(slot);
  known.set(slot, read);
  if (known.size > KEPT) known.delete(known.keys().next().value);
  return read;
}

/** Waits for the `reads` under way: until they are in when `wait` is null, else never past `wait` ms. */
async function settle(reads, wait) {
  const all = Promise.all(reads.filter(Boolean).map((read) => read.done));
  if (wait === null) {
    await all;
    return;
  }
  let timer;
  await Promise.race([all, new Promise((resolve) => { timer = setTimeout(resolve, wait); })]);
  clearTimeout(timer);
}

/** Runs a settings write; should the settings be busy, the next look writes them. */
const write = (fn, value) => (fn ? Promise.resolve().then(() => fn(value)).catch(() => {}) : null);

/**
 * What GitHub keeps of the repository `top`. `all`: the files versions keep
 * out, by name, the ones `kept` (seen before) and the ones a version on
 * origin's branches (`tips`, their object ids as for-each-ref lists them)
 * added or changed, new ones going to `keep`. `names`: the ones the bar
 * names, all but those still put away in `done` ({ names, since: origin's
 * branches when they were put away }). `done`: the names still put away, as
 * one a version after `since` added or changed is taken off for good
 * (through `keepDone`). `settled`: whether every read is in. A read of a long
 * history never holds the answer up past `wait` (null: until it is in): the
 * names kept, and the ones put away, stand until it is in.
 */
export async function lookAtGithub(top, { tips, kept = [], keep, done = {}, keepDone, wait = WAIT_MS }) {
  const read = tips ? readFor(top, top, tips, ['--remotes=origin']) : null;
  const put = (done.names || []).filter((name) => typeof name === 'string');
  const since = (done.since || []).filter((id) => VERSION_ID.test(id));
  // A version from then may be gone from this computer: git reads past it.
  const after = tips && put.length ? readFor(`${top}\0since`, top, `${tips}\0${since.join(' ')}`, ['--ignore-missing', '--remotes=origin', '--not', ...since]) : null;
  await settle([read, after], wait);
  // What came after is on origin's branches too, and its shorter read may be in first.
  const all = [...new Set([...kept, ...(read?.found || []), ...(after?.found || [])])].sort();
  if (all.length > new Set(kept).size) await write(keep, all);
  const back = new Set(after?.found || []);
  const standing = put.filter((name) => !back.has(name));
  if (standing.length < put.length) await write(keepDone, { names: standing, since });
  const away = new Set(standing);
  return { all, names: all.filter((name) => !away.has(name)), done: standing, settled: [read, after].every((r) => !r || r.finished) };
}

/** The files versions keep out that GitHub keeps of the repository `top` and the bar names (lookAtGithub). */
export async function githubKeeps(top, options) {
  return (await lookAtGithub(top, options)).names;
}

/** A JSON setting of the repository `top`, or `fallback` when it is not set or not JSON. */
async function setting(git, top, key, fallback) {
  try {
    return JSON.parse((await git(top, ['config', '--get', key])).trim()) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Writes the names put away, with origin's branches then (`since`), in the repository's settings. */
export function saveDone(git, top, { names, since }) {
  const ids = [...new Set(since.filter((id) => VERSION_ID.test(id)))];
  return git(top, ['config', 'censai.githubKeepsDone', JSON.stringify({ names: [...new Set(names)].sort(), since: ids })]);
}

/** What lookAtGithub takes for the repository `top`: its own settings and origin's branches, read and written with `git` (runGit). */
export async function githubKeepsSettings(top, git) {
  const kept = await setting(git, top, 'censai.githubKeeps', []);
  const done = await setting(git, top, 'censai.githubKeepsDone', {});
  const tips = String(await git(top, ['for-each-ref', '--format=%(objectname)', 'refs/remotes/origin']).catch(() => '')).trim();
  return {
    tips,
    kept: Array.isArray(kept) ? kept.filter((name) => typeof name === 'string') : [],
    keep: (names) => git(top, ['config', 'censai.githubKeeps', JSON.stringify(names)]),
    done: { names: Array.isArray(done?.names) ? done.names : [], since: Array.isArray(done?.since) ? done.since : [] },
    keepDone: (value) => saveDone(git, top, value),
  };
}
