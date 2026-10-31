import { COPY_SAMPLES, SECRET_ENDINGS, SECRET_SAMPLES, inHiddenFolder, isSecretFileName } from '../security/secretFiles.js';
import { baseName } from './adapters/shared.js';
import { withoutHiddenIn } from './hiddenWords.js';
import { shellWords } from './shellWords.js';
import { colonParts, withoutLinkLogins, withoutRoot, wordsForTeammate } from './teammateOutput.js';

// Anyone on the board may watch a coding agent's task, but a teammate never
// sees the words of a file only this computer's owner opens (one that holds
// keys, or one in a hidden folder): a step that read or wrote one, or read or
// wrote without naming one file, or a command that names one (`echo KEY=... >>
// .env` carries the words itself), works in a hidden folder (`cd .git`) or may
// reach one with a wildcard (`cat .env*`, `cat config/*`), shows only its title
// and that it happened. In every other step's output, and in what the agent
// says, such a file's lines and diffs are left out (server/cli-agents/teammateOutput.js),
// and a key, password or token from what was left out shows as [hidden]
// wherever it comes back in the task (server/cli-agents/taskHiddenWords.js).
// A permission request's raw input stays on the server for everyone; the
// console draws its title, detail and diff. Paths in the task's worktree are
// judged from its root, which itself may sit in a hidden folder (~/.censai, .homebase-state).

/** `p` from the worktree's root when it is in the worktree, else as it is. */
function fromRoot(p, root) {
  const text = String(p || '');
  if (!root) return text;
  if (text === root) return '.';
  return text.startsWith(`${root}/`) || text.startsWith(`${root}\\`) ? text.slice(root.length + 1) : text;
}

// Code that names the settings, not a file: process.env, import.meta.env.
const CODE_WORDS = /^(?:process|import\.meta)\.env$/i;

// Folders that hold sign-ins (~/.ssh, ~/.aws, ~/.config): each file in one holds keys, whatever its name.
const LOGIN_FOLDER = /(?:^|[\\/])\.(?:ssh|gnupg|aws|azure|docker|kube|config|local|secrets?)(?:[\\/]|$)/i;

// GitHub's settings (workflows, templates) hold no logins (server/security/secretFiles.js),
// so a wildcard there for YAML files (`.github/workflows/*.yml`) reaches no secrets.yml.
const GITHUB_SETTINGS = /(?:^|[\\/])\.github[\\/]/i;
const YAML = /\.ya?ml$/;

/** True for a path (in the worktree, or out of it) to a file only the owner opens; with `keysOnly`, to one that holds keys. */
export function ownerOnlyStepPath(p, { isFile = true, root = '', keysOnly = false } = {}) {
  const text = fromRoot(p, root);
  const name = baseName(text);
  const folder = keysOnly ? LOGIN_FOLDER.test(text) : inHiddenFolder(text, { isFile });
  return Boolean(text) && !CODE_WORDS.test(name) && (isSecretFileName(name) || folder);
}

/** True when `glob` (with * and ?) matches all of `name`, in time that grows only with their lengths. */
function wildcard(glob, name) {
  let g = 0;
  let n = 0;
  let star = -1;
  let from = 0;
  while (n < name.length) {
    if (g < glob.length && (glob[g] === '?' || glob[g] === name[n])) {
      g += 1;
      n += 1;
    } else if (g < glob.length && glob[g] === '*') {
      star = g;
      from = n;
      g += 1;
    } else if (star >= 0) {
      g = star + 1;
      from += 1;
      n = from;
    } else {
      return false;
    }
  }
  while (glob[g] === '*') g += 1;
  return g === glob.length;
}

/**
 * True for a wildcard that may reach a file that holds keys: `.env*`, `*.pem`,
 * `id_*`, `server.*` (server.key), `*.bak` (id_rsa.bak), `prod*.tfvars.json`
 * (prod.auto.tfvars.json), and a bare `*`, which reaches every file in its folder.
 */
function globReachesSecret(word) {
  const last = baseName(word).toLowerCase();
  if (!/[*?]/.test(last) || last.length > 255) return false;
  // The wildcard with each `*` as the middle of a Firebase key's or a Terraform file's name: made-up-firebase-adminsdk*.json.
  if (['-x-', '.auto'].some((fill) => isSecretFileName(last.replace(/\*+/g, fill)))) return true;
  // What the wildcard spells before each of its first few `*`, a `?` as any letter: `server.` of `server.*`.
  const starts = [];
  for (let at = last.indexOf('*'); at >= 0 && starts.length < 3; at = last.indexOf('*', at + 1)) {
    starts.push(last.slice(0, at).replace(/\*/g, '').replace(/\?/g, 'x'));
  }
  const samples = GITHUB_SETTINGS.test(word) ? SECRET_SAMPLES.filter((name) => !YAML.test(name)) : SECRET_SAMPLES;
  const names = [...samples, ...starts.flatMap((start) => SECRET_ENDINGS.map((end) => `${start}${end}`))];
  return names.some((name) => COPY_SAMPLES.some((mark) => wildcard(last, name + mark) && isSecretFileName(name + mark)));
}

// A brace list bash spells out into several words: server.{crt,key}, *.{pem,key}.
const BRACE_LIST = /\{([^{}\s,]*(?:,[^{}\s,]*)+)\}/;
const MAX_SPELLED = 256;

/** One word as bash spells out its brace lists; past a few, a list left is taken as a wildcard (`x{a,b}` as `x*`). */
function spelledOut(word) {
  let words = [word];
  for (let round = 0; round < 4; round += 1) {
    const lists = words.map((one) => BRACE_LIST.exec(one));
    const count = lists.reduce((n, list) => n + (list ? list[1].split(',').length : 1), 0);
    if (!lists.some(Boolean) || count > MAX_SPELLED) break;
    words = words.flatMap((one, at) => {
      const list = lists[at];
      if (!list) return [one];
      const [before, after] = [one.slice(0, list.index), one.slice(list.index + list[0].length)];
      return list[1].split(',').map((item) => `${before}${item}${after}`);
    });
  }
  return words.map((one) => one.replace(new RegExp(BRACE_LIST.source, 'g'), '*'));
}

// Words after these name a folder to work in or look through: cd .git, pushd ~/.ssh, find .git, git -C .git.
const FOLDER_BEFORE = new Set(['cd', 'pushd', 'find', '-C']);

// More wildcards than this in one command are taken to reach such a file, rather than judged one by one.
const MAX_WILDCARDS = 32;

/** True when some words (a command, a tool's input) name such a file or a hidden folder to work in, or may reach one. */
export function namesOwnerOnly(words, { root = '', keysOnly = false } = {}) {
  const text = String(words || '');
  const bash = shellWords(text);
  // Without the worktree's folder where a path starts in a word: {"file":"<worktree>/notes.md"} reads file:notes.md.
  const read = (list) => (list.length ? withoutRoot(list.join('\0'), root).split('\0').flatMap(spelledOut) : []);
  const lists = [
    // Each word whole, as bash hands it on: `cat "server (1).pem"` names server (1).pem.
    read(bash.words),
    // What each pair of quotes holds, as a tool's input in JSON names a file: {"file":"secrets copy.json"}.
    read(bash.quoted),
    // And loosely, split at brackets, quotes and signs too: KEY=$(cat .env).
    text.split(/\s+/).flatMap(spelledOut).join(' ').split(/[\s;|&<>()'"`=$,{}[\]]+/).filter(Boolean),
  ];
  if (new Set(lists.flat().filter((word) => /[*?]/.test(word))).size > MAX_WILDCARDS) return true;
  const judged = new Set(); // a word said again is judged once
  return lists.some((list) => list.some((word, at) => {
    const isFile = !FOLDER_BEFORE.has(list[at - 1]);
    if (judged.has(`${isFile}:${word}`)) return false;
    judged.add(`${isFile}:${word}`);
    return [word, ...colonParts(word)].some((part) => part && (ownerOnlyStepPath(part, { root, isFile, keysOnly }) || globReachesSecret(part)));
  }));
}

/** True when `title` repeats any eight characters in a row of `command`, as some agents title a step with its command, whole or cut short. */
function repeatsCommand(title, command) {
  const words = String(command || '');
  const text = String(title || '');
  for (let at = 0; at + 8 <= text.length; at += 1) if (words.includes(text.slice(at, at + 8))) return true;
  return false;
}

/** True when a step reads, writes or names such a file (with `keysOnly`, one that holds keys), or may. */
export function touchesOwnerOnly(item, root, { keysOnly = false } = {}) {
  const files = Array.isArray(item.files) ? item.files : [];
  // A read or write that names no one file (several at once, a patch) may be on such a file.
  if (['read', 'edit'].includes(item.kind) && !(item.path || item.diff?.path || item.detail || files.length)) return true;
  if (item.kind === 'search' && ownerOnlyStepPath(item.where, { isFile: false, root, keysOnly })) return true;
  return [item.path, item.diff?.path, ...files.map((file) => file?.path)].some((p) => ownerOnlyStepPath(p, { root, keysOnly }))
    || [item.command, item.detail, item.input].some((words) => namesOwnerOnly(words, { root, keysOnly }));
}

/** One transcript item as a teammate sees it; `root` is the task's worktree, `hidden` its taskHiddenWords. */
export function stepForTeammate(item, { root = '', hidden = [] } = {}) {
  if (!item || typeof item !== 'object') return item;
  if (touchesOwnerOnly(item, root)) {
    const { output: _output, diff: _diff, input: _input, command: _command, detail: _detail, text: _text, ...rest } = item;
    // A title that repeats the command would carry its words.
    return withoutHiddenIn({ ...rest, title: repeatsCommand(item.title, item.command) ? 'Run a command' : item.title, ownerOnly: true }, hidden);
  }
  const shown = { ...item };
  for (const key of ['command', 'detail', 'input', 'title', 'query']) if (typeof shown[key] === 'string') shown[key] = withoutLinkLogins(shown[key]);
  const ownerOnly = (p) => ownerOnlyStepPath(p, { root });
  if (shown.output) shown.output = wordsForTeammate(shown.output, { root, ownerOnly });
  // What the agent printed as it is (Copilot, plain lines) is judged as output; what it said, less loosely.
  if (typeof shown.text === 'string') shown.text = wordsForTeammate(shown.text, { root, ownerOnly, said: !shown.printed });
  return withoutHiddenIn(shown, hidden);
}

/** A task as a teammate sees it: its summary and last error, an agent's own words that may quote such a file, judged as output. */
export function taskForTeammate(task, { hidden = [] } = {}) {
  if (!task || typeof task !== 'object') return task;
  const root = task.worktree?.dir || '';
  const ownerOnly = (p) => ownerOnlyStepPath(p, { root });
  const judged = (words) => (typeof words === 'string' ? wordsForTeammate(words, { root, ownerOnly }) : words);
  return withoutHiddenIn({ ...task, summary: judged(task.summary), lastError: judged(task.lastError) }, hidden);
}

/** One permission request as a viewer sees it: never its raw input, and for a teammate nothing of such a file but its title. */
export function permissionForViewer(request, { owner = false, root = '', hidden = [] } = {}) {
  const { input: _input, ...shown } = request || {};
  if (owner) return shown;
  if (!touchesOwnerOnly(shown, root)) return withoutHiddenIn(typeof shown.detail === 'string' ? { ...shown, detail: withoutLinkLogins(shown.detail) } : shown, hidden);
  return withoutHiddenIn({ ...shown, detail: null, diff: null, ownerOnly: true }, hidden);
}
