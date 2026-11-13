import path from 'path';
import { SECRET_CHANGES } from '../../shared/files/fileProblems.js';

// Files that hold keys and passwords by their very name: a project's .env (not
// its .env.example), key and certificate files, SSH keys and the files tools
// keep their logins in, keys downloaded from Google and Firebase, a project's
// secrets file (not secrets.example.json), Terraform's values and the state
// it writes them into, and copies and backups of them (.env~, id_rsa.bak,
// "credentials (1).json"). Only this computer's owner opens them on the board
// (server/security/ownerOnlyFiles.js), and Step cards never read their words.
// Hidden folders (.git, .ssh, a tool's logins) are kept for the owner too.

/** The error code for a file only this computer's owner may open. */
export const OWNER_ONLY_FILE = 'CENSAI_OWNER_ONLY_FILE';

/** censaiOS's own state folder (its keys, the CLI tools' logins, its logs): server/routes/files/ownState.js keeps it off the board, and saved versions leave it out. */
export const STATE_FOLDER = '.homebase-state';

const EXAMPLE = /\.(example|sample|template)$/;
const KEY_EXTENSIONS = new Set(['.pem', '.key', '.p8', '.p12', '.pfx', '.jks', '.keystore', '.ppk', '.crt', '.cer', '.der']);
const SECRET_NAMES = new Set([
  '.envrc', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'credentials', 'credentials.json', '.credentials.json',
  '.netrc', '_netrc', '.npmrc', '.pypirc', '.pgpass', '.git-credentials', '.htpasswd',
  '.vault-token', '.s3cfg', '.my.cnf', '.boto', '.dockercfg', '.terraformrc', 'terraform.rc', '.bash_history', '.zsh_history',
  'serviceaccountkey.json', 'secrets.json', 'secrets.yml', 'secrets.yaml', 'terraform.tfvars', 'terraform.tfvars.json',
]);
// Keys downloaded from Google (client_secret_<id>.apps.googleusercontent.com.json)
// and Firebase (<project>-firebase-adminsdk-<id>.json); an example of one says
// so before its extension (client_secret.example.json, client_secret_sample.json).
const SECRET_PATTERNS = [/^client_secret.*\.json$/, /^.+-firebase-adminsdk-.+\.json$/];
const EXAMPLE_BEFORE_EXTENSION = /[._-](?:example|sample|template)\.[^.]+$/;
// Terraform's state, which holds every value it manages, passwords too
// (terraform.tfstate, errored.tfstate, their backups and lock), and the values
// it reads by itself from any *.auto.tfvars or is handed (-var-file=prod.tfvars),
// all of which GitHub's own ignore list for Terraform keeps out. A handed one
// that is an example says so before its ending (prod.example.tfvars).
const TERRAFORM_STATE = /\.tfstate(?:\.\d+)?(?:\.backup|\.lock\.info)?$/;
const TERRAFORM_VALUES = /^(.*?)(\.auto)?\.tfvars(?:\.json)?$/;
const EXAMPLE_NAME = /(?:^|[._-])(?:example|sample|template)$/;
// What a copy or a backup adds to a name: "~", ".bak", ".old", " copy", " - Copy", " (1)", "(1)".
const COPY_MARK = /(?:~|\.(?:bak|backup|old|orig|save|swp|tmp)|(?: -)?[ _-]copy(?: \d+)?| \([^)]*\)|\(\d+\))$/;
// Vim keeps a file's unsaved words beside it as ".<name>.swp" (.swo, .swn, ... when there are more).
const VIM_SWAP = /^\.(.+)\.sw[a-p]$/;
// Hidden folders a project shares on purpose and that hold no logins: GitHub's
// settings (workflows, templates) and censaiOS's own notes for the board's agents.
const SHARED_HIDDEN_FOLDERS = new Set(['.github', '.team']);

/** Names that hold keys, one of each kind, to test a glob in a command (`.env*`, `*.pem`) against. */
export const SECRET_SAMPLES = Object.freeze([
  '.env', '.env.local', 'name.env', 'name_key', 'name-key', ...SECRET_NAMES, ...[...KEY_EXTENSIONS].map((ext) => `name${ext}`),
  'client_secret_x.apps.googleusercontent.com.json', 'name-firebase-adminsdk-x.json', 'name.auto.tfvars', 'name.auto.tfvars.json',
  'name.tfvars', 'name.tfvars.json', 'terraform.tfstate', 'terraform.tfstate.backup',
]);
/** What makes a name hold keys whatever comes before it, to test a glob's own start with (`server.*` reaches server.key). */
export const SECRET_ENDINGS = Object.freeze(['', '.env', '_key', '-key', '.auto.tfvars', '.tfvars', '.tfstate', ...KEY_EXTENSIONS]);
/** What a copy or a backup adds to a name (COPY_MARK), one of each kind, to test a glob such as `*.bak` with. */
export const COPY_SAMPLES = Object.freeze(['', '~', '.bak', '.backup', '.old', '.orig', '.save', '.swp', '.tmp', ' copy', ' (1)']);

const unmarked = (text) => {
  let next = text;
  while (COPY_MARK.test(next)) next = next.replace(COPY_MARK, '');
  return next;
};

/** The name a copy or a backup was made from: its marks taken off its end ("id_rsa.bak") and before its extension ("credentials (1).json"). */
function original(name) {
  const plain = unmarked(name);
  const ext = path.extname(plain);
  return ext ? `${unmarked(plain.slice(0, -ext.length))}${ext}` : plain;
}

function secretName(lower) {
  // A swap file of a file named without a dot (.id_rsa.swp for id_rsa) holds what that file holds.
  const swapOf = VIM_SWAP.exec(lower)?.[1];
  if (swapOf && secretName(swapOf)) return true;
  const name = original(lower);
  if (!name || EXAMPLE.test(name)) return false;
  // .env, .env.local, .env-production, .env_prod, .env2, .env-cmdrc, prod.env (not .environment)
  if (/^\.env(?![a-z])/.test(name) || name.endsWith('.env')) return true;
  // SSH keys by any name they are given (id_rsa_work, id_ed25519-2, not their .pub halves), and deploy_key, private-key.
  if (/^id_(?:rsa|dsa|ecdsa|ed25519)(?:[_-][a-z0-9_-]*|\d+)?$/.test(name) || /^[a-z0-9_-]+[_-]key$/.test(name)) return true;
  if (SECRET_NAMES.has(name) || KEY_EXTENSIONS.has(path.extname(name))) return true;
  if (TERRAFORM_STATE.test(name)) return true;
  const values = TERRAFORM_VALUES.exec(name);
  if (values) return Boolean(values[2]) || !EXAMPLE_NAME.test(values[1]);
  return !EXAMPLE_BEFORE_EXTENSION.test(name) && SECRET_PATTERNS.some((pattern) => pattern.test(name));
}

/** True for a file name that holds keys or passwords by convention. */
export function isSecretFileName(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.length > 260) return false; // longer than any file's name can be
  const trimmed = (n) => {
    let end = n.length;
    while (end > 0 && (n[end - 1] === '.' || n[end - 1] === ' ')) end -= 1;
    return n.slice(0, end);
  };
  // Windows opens "name." and "name::$DATA" as "name", so neither slips past;
  // elsewhere a ":" belongs to the name, so the whole name is judged too.
  return secretName(trimmed(lower)) || secretName(trimmed(lower.split(':')[0]));
}

/**
 * True when `rel`, a path inside a project, goes through a hidden folder such
 * as .git or .ssh (not .github or .team); with isFile false, `rel` itself
 * counts as a folder too.
 */
export function inHiddenFolder(rel, { isFile = true } = {}) {
  const parts = String(rel || '').split(/[\\/]/).filter((part) => part && part !== '.' && part !== '..');
  return (isFile ? parts.slice(0, -1) : parts).some((part) => part.startsWith('.') && !SHARED_HIDDEN_FOLDERS.has(part.toLowerCase()));
}

/**
 * True when `rel`, a path in a GitHub repo, names a file that holds keys:
 * judged tidied (a/../.env is .env) and up to a ? or #, which a GitHub read
 * spelled with encodeURI (server/github.js) sends as a query.
 */
export function secretRepoPath(rel) {
  const text = String(rel || '').replace(/\\/g, '/');
  return [text, text.split(/[?#]/)[0]].some((p) => isSecretFileName(path.posix.basename(path.posix.normalize(p || '.'))));
}

/** Where a file's part of a diff starts: git diff's header, or a merge's combined one. */
export const DIFF_HEADER = /^diff --(?:git|cc|combined) /m;

/** The one path a header's "a/P b/P" names ("P P" with --no-prefix, "c/P w/P" with other prefixes), or ''. */
function headerPath(both) {
  for (const skip of [0, 2]) {
    const size = (both.length - 1 - 2 * skip) / 2;
    const one = both.slice(skip, skip + size);
    if (Number.isInteger(size) && size > 0 && both[skip + size] === ' ' && both.endsWith(one)) return one;
  }
  return '';
}

/** The paths one file's part of a diff is about: its header's, both sides of a rename or copy, and the ---/+++ names. */
function diffPaths(part) {
  const head = part.split(/^@@/m)[0];
  // A name git had to quote ("na\303\257ve/.env") is judged without its quotes.
  const first = head.split('\n', 1)[0].replace(/"/g, '');
  const combined = /^diff --(?:cc|combined) (.+)$/.exec(first)?.[1];
  const named = [...head.matchAll(/^(?:(?:rename|copy) (?:from|to) |--- |\+\+\+ )(.+)$/gm)]
    .map((m) => m[1].replace(/"/g, '').replace(/\t.*$/, '')).filter((p) => p !== '/dev/null');
  return [combined || headerPath(first.slice('diff --git '.length)), ...named].filter(Boolean);
}

/**
 * A diff (git diff) with what changed in each file that holds keys or
 * passwords left out, and with `hidden` also in each file in a hidden folder
 * (for a teammate, who cannot open those); the file's own first line stays,
 * so it still shows as changed. A part whose path cannot be told is left out too.
 */
export function diffWithoutSecrets(patch, { hidden = false } = {}) {
  const kept = (p) => isSecretFileName(path.posix.basename(p)) || (hidden && inHiddenFolder(p));
  return String(patch || '').split(/^(?=diff --(?:git|cc|combined) )/m).map((part) => {
    if (!DIFF_HEADER.test(part.split('\n', 1)[0])) return part;
    const paths = diffPaths(part);
    if (paths.length && !paths.some(kept)) return part;
    return `${part.split('\n', 1)[0]}\n${SECRET_CHANGES}\n`;
  }).join('');
}

// GitHub follows a link in a repo and answers with the file it leads to.
/** What a read through such a link to a file that holds keys gets, whoever asks. */
export const LINKED_SECRET = 'This is a link to a file that can hold keys or passwords, so it is not read through the link.';

/** True when GitHub answered a read of `asked` with `answered`, a file that holds keys reached through a link. */
export function linkedSecret(asked, answered) {
  return Boolean(answered) && secretRepoPath(answered) && !secretRepoPath(asked);
}
