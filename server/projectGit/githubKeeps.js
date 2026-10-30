import { keptOutChangedIn } from './keptOut.js';

// The files versions keep out (./keptOut.js) that the versions GitHub has
// hold: sent before censaiOS left such files out, or pushed by a terminal or
// an agent with plain git. GitHub keeps every version it has, even one whose
// branch is gone (a pull request keeps it), so the version bar names them and
// says to make new keys, and a name once seen stays: the repository keeps it
// in its own settings (./git.js). What GitHub has is this repository's own
// word of it (origin's branches as the last send, fetch or push left them),
// so the bar never waits on GitHub.

// How long the bar waits for a new answer; a longer history answers at a later look.
const WAIT_MS = 2_000;
// How long git may read a history, out of the bar's way.
const READ_MS = 300_000;
// A read git could not finish is tried again after this, or once the branches move.
const RETRY_MS = 600_000;
// Reads kept, one per repository, the oldest dropped first.
const KEPT = 50;
const known = new Map();

/** Starts reading what origin's branches (at `tips`) hold, unless that read is done or under way. */
function readFor(top, tips) {
  const had = known.get(top);
  if (had?.tips === tips && !(had.failed && Date.now() - had.failed > RETRY_MS)) return had;
  // Names from other branches never stand for these: the names kept carry over instead.
  const read = { tips, found: [] };
  read.done = keptOutChangedIn(top, ['--remotes=origin'], { timeout: READ_MS }).then((found) => {
    read.found = found.map((name) => name.toString('utf8'));
  }, () => { read.failed = Date.now(); });
  known.delete(top);
  known.set(top, read);
  if (known.size > KEPT) known.delete(known.keys().next().value);
  return read;
}

/**
 * The files versions keep out that GitHub keeps of the repository `top`, by
 * name: the ones `kept` (seen before) and the ones a version on origin's
 * branches (`tips`, their object ids as for-each-ref lists them) added or
 * changed. New ones go to `keep`, so they stay named once those branches
 * move on. A read of a long history never holds the answer up past WAIT_MS:
 * the names kept stand until it is in.
 */
export async function githubKeeps(top, { tips, kept = [], keep }) {
  const read = tips ? readFor(top, tips) : null;
  if (read) {
    let timer;
    await Promise.race([read.done, new Promise((resolve) => { timer = setTimeout(resolve, WAIT_MS); })]);
    clearTimeout(timer);
  }
  const names = [...new Set([...kept, ...(read?.found || [])])].sort();
  // Should the settings be busy, the next look keeps them.
  if (keep && names.length > new Set(kept).size) await Promise.resolve().then(() => keep(names)).catch(() => {});
  return names;
}
