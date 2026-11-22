// The one line that ties a pull request (or a comment) to a coding job.
//
// Every coding job has a key of its own: a random id made when the job is
// filed and kept on its row (agent_github_tasks.task_key). It is not a
// counter, so two installs, or one whose database was reset, never share a
// key. The worker that builds the job copies this line into the pull request
// description, and the job is then followed by that key, whatever the branch
// is called:
//
//     <!-- censai-task: KEY -->
//
// A reviewer who finds the job is already fixed on the main branch writes the
// second form in a signed comment on the job's issue, naming the full commit:
//
//     <!-- censai-task: KEY already-fixed COMMIT -->
//
// The line only counts on a line of its own, outside code: not inside a
// fenced block or a <pre> block, not indented as code, not in backticks, not
// quoted. So a page
// that explains the format (like this one, or a pull request that describes
// it) ties nothing. A key that matches is still not enough on its own: the
// repository and the worker's branch must match the job too
// (server/github/agentTaskFacts.js). This file has no imports, so a workflow
// script can use it as it is.

export const TASK_MARKER_NAME = 'censai-task';

const KEY = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const LINK = new RegExp(`^ {0,3}<!--\\s*${TASK_MARKER_NAME}:\\s*(${KEY})\\s*-->\\s*$`, 'i');
const FIXED = new RegExp(`^ {0,3}<!--\\s*${TASK_MARKER_NAME}:\\s*(${KEY})\\s+already-fixed\\s+([0-9a-f]{40})\\s*-->\\s*$`, 'i');
// CommonMark fenced code: an opening fence is three or more backticks or
// tildes, indented at most three spaces; after backticks the rest of the line
// (the info string) may not hold a backtick, or it is inline code, not a fence.
// A closing fence is the same character, at least as long, with nothing after
// it but spaces. A fence never closed runs to the end, as GitHub shows it.
const OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
// An HTML <pre> block runs from a line that starts with <pre to the line holding </pre>.
const PRE_OPEN = /^ {0,3}<pre(?:[\s>]|$)/i;
const PRE_CLOSE = /<\/pre>/i;
const MOST = 5;

/** True for a job key (the random id on the job's row). */
export function isTaskKey(value) {
  return new RegExp(`^${KEY}$`, 'i').test(String(value ?? '').trim());
}

function key(value) {
  if (!isTaskKey(value)) throw new Error('That is not a coding job key.');
  return String(value).trim().toLowerCase();
}

// The lines of a text that are not inside a fenced code block or a <pre> block.
function plainLines(text) {
  const lines = [];
  let fence = null;
  let pre = false;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (fence) {
      const close = CLOSE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
    } else if (pre) {
      if (PRE_CLOSE.test(line)) pre = false;
    } else {
      const open = OPEN.exec(line);
      if (open && !(open[1][0] === '`' && open[2].includes('`'))) fence = open[1];
      else if (PRE_OPEN.test(line)) pre = !PRE_CLOSE.test(line);
      else lines.push(line);
    }
  }
  return lines;
}

/** The line a worker puts in its pull request description. */
export function taskMarker(taskKey) {
  return `<!-- ${TASK_MARKER_NAME}: ${key(taskKey)} -->`;
}

/** The job keys a text names on lines of their own, first five, no repeats. */
export function taskKeysIn(text) {
  const found = [];
  for (const line of plainLines(text)) {
    const match = LINK.exec(line);
    if (match && !found.includes(match[1].toLowerCase())) found.push(match[1].toLowerCase());
    if (found.length >= MOST) break;
  }
  return found;
}

/** The line a reviewer writes when a commit on the main branch already fixes the job. */
export function alreadyFixedMarker(taskKey, sha) {
  const commit = String(sha ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Name the full 40-character commit.');
  return `<!-- ${TASK_MARKER_NAME}: ${key(taskKey)} already-fixed ${commit} -->`;
}

/** Every "already fixed" line in a text: [{ taskKey, sha }]. */
export function alreadyFixedIn(text) {
  const found = [];
  for (const line of plainLines(text)) {
    const match = FIXED.exec(line);
    if (match) found.push({ taskKey: match[1].toLowerCase(), sha: match[2].toLowerCase() });
    if (found.length >= MOST) break;
  }
  return found;
}
