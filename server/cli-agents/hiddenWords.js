// What a teammate could not see in a coding agent's task stays out of what
// they see anywhere else in it. A step on a file only this computer's owner
// opens shows a teammate only its title, and lines from such a file are cut
// from other steps (server/cli-agents/ownerOnlySteps.js), but the agent can
// repeat a key it read there: in what it says, in a later command's output,
// in its summary. The words in what a teammate could not see that look like
// a key, a password or a token are gathered from the whole task, and wherever
// one comes back a teammate sees HIDDEN_MARK instead. Common words, names of
// settings, file names, addresses, numbers and short values stay, and so does
// a password of plain letters (POSTGRES_PASSWORD=postgres), which is too
// common a word to hide everywhere, so the rest still reads. A certificate is
// no secret, and a hidden folder's own files (.git, a cache) are full of long
// words that are none either, so there only settings' values, links' logins,
// hooks' paths, the word after Bearer and a private key's lines count.

import { HIDDEN_MARK } from '../../shared/files/fileProblems.js';

export { HIDDEN_MARK };

// Shorter words are too common to hide everywhere. A word this long with a
// letter and a digit, or any word of LONG_WORD, looks like a key or a token.
const MIN_WORD = 8;
const LONG_WORD = 20;
// A setting's name, in capitals or small letters with _ between words: NEXT_PUBLIC_SITE_NAME, AWS_S3_BUCKET.
const SETTING_NAME = /^(?:[A-Z][A-Z0-9]*(?:_[A-Z][A-Z0-9]*)+|[a-z]+(?:_[a-z]+)+)$/;
// A setting whose name says it holds a secret, and a link's password, are hidden from MIN_VALUE: PASSWORD=hunter-two.
const SECRET_NAME = /key|secret|token|pass|pwd|(?:^|[_.-])(?:pw|pin)(?:$|[_.-])|psk|auth|credential|private|cookie|session|dsn|signature|salt|webhook/i;
const MIN_VALUE = 6;
// A password or a pin may be a number (ADMIN_PIN=482913); another setting's number is a setting (SESSION_MAX_AGE=2592000).
const NUMBER_NAME = /pass|pwd|(?:^|[_.-])(?:pw|pin)(?:$|[_.-])/i;
const NUMBER_VALUE = /^\d{6,}$/;
// Another setting's value of small letters and numbers in parts reads as a name: us-east-1, node:20-alpine, made-up-bucket-2024.
const PLAIN_VALUE = /^(?=.*\d)[a-z0-9]+(?:[-.:/][a-z0-9]+)+$/;
// An unquoted value that is code, not a key: useSession(), crypto.randomBytes(32), req.headers[...].
const CODE_VALUE = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*[([]/;
// A stand-in for a value: $MADE_UP_KEY, ${MADE_UP_KEY}, {{key}}, <key>.
const PLACEHOLDER = /^(?:\$\{?\w+\}?|\{\{.*\}\}|<[\w-]+>)$/;
// The word after a header's scheme: Authorization: Bearer <token>, Basic <login>, Token <key>.
const AUTH_WORD = /\b(?:bearer|basic|token)\s+([^\s"',;}]+)/gi;
// A setting read in code is a name: process.env.MADE_UP_KEY, import.meta.env.VITE_SITE_NAME.
const ENV_NAME = /^(?:process\.env|import\.meta\.env)\.\w+!?$/;
// An address on this computer, or a name and a port: localhost:3000, http://127.0.0.1:5173/api, redis:6379.
const LOCAL_ADDRESS = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/\S*)?$|^[a-z][a-z0-9.-]*:\d{2,5}$/i;
// NAME=value, name: value, "name": "value", export NAME="value", after any mark that is no part of
// a name: echo NAME=value >> .env, a diff's +NAME=value, a search's path:3:NAME=value, Claude Code's 3→NAME=value.
// The value is only looked at, so a setting in another's value counts too: "env": "NAME=value".
const SETTING = /(?<![\w.-])(?:export\s+)?["']?([\w.-]+)["']?\s*(?:=|:(?=[\s"']))(?=\s*(["']?)([^\s"',;}]+))/g;
// The login in a link, https://user:password@host or https://token@host.
const LINK_LOGIN = /:\/\/([^\s/@'"`]+)@/g;
// A file's name or path, with its line number: notes.md:12, src/app.js.
const FILE_LIKE = /\.[a-z][a-z0-9]{0,4}(?::\d+)*$/i;
// A search's file and line before the words it found: ./made-up.pem:2:
const SEARCH_HIT = /^[^\s:]+:\d+:/;
// What splits words; ":", "/", "@", "+", "." and "-" stay inside one (links, keys in base64).
const BETWEEN_WORDS = /[\s'"`=,;&()<>[\]{}|\\→]+/;
// A link is judged part by part: its address is no secret, its login (user:password) and a token in its path may be.
const LINK_PARTS = /[/?#&=@]+/;
// A hook's link holds its key in its path, however short its parts: https://hooks.example.com/catch/1234567/abc1de2/.
const HOOK = /hook/i;
// JSON's and a shell's \n, \r and \t, which put a key's lines on one line.
const ESCAPES = /\\[nrt]/g;
// The first and last line of a key or a certificate, and the kinds that are no secret; between them, base64 lines,
// after Claude Code's line number (3→), a search's file and line (key.pem:3:) or a diff's + or -.
const PEM_EDGE = /-----(BEGIN|END) ([A-Z0-9 ]{1,40})-----/;
const PUBLIC_PEM = /^(?:TRUSTED |X509 )?(?:CERTIFICATE(?: REQUEST)?|PUBLIC KEY|X509 CRL)$/;
const PEM_LINE = /^\s*(?:\d+→|[^\s:]+:\d+:)?[+-]?([A-Za-z0-9+/=]{4,128})\s*$/;
// The fields of a step that hold its words (an object's own words too), and of a diff the ones that hold a file's words.
const STEP_WORDS = ['title', 'output', 'text', 'command', 'detail', 'input', 'query'];
const DIFF_WORDS = ['before', 'after', 'patch'];
// The fields a viewer reads in a step, a task or a request.
const SHOWN_WORDS = ['title', 'command', 'detail', 'input', 'query', 'output', 'text', 'summary', 'lastError', 'prompt'];
// Characters of one text judged at most, and of one word.
const MAX_CHARS = 200_000;
const MAX_WORD = 4096;

const hasLetterAndDigit = (word) => /[a-z]/i.test(word) && /\d/.test(word);
const isPlain = (word) => SETTING_NAME.test(word) || LOCAL_ADDRESS.test(word) || ENV_NAME.test(word) || (!word.includes('://') && FILE_LIKE.test(word));
// A word shaped like a key or a token: long, or a letter and a digit in a shorter one.
const isTokenShaped = (word) => (word.length >= LONG_WORD || (word.length >= MIN_WORD && hasLetterAndDigit(word))) && !isPlain(word);
// A secret setting's value or a link's password: anything but a plain word of letters, a number, a name, a file,
// an address, a stand-in or the first line of a key ("-----BEGIN", whose own lines are judged on their own).
const isSecretValue = (value) => value.length >= MIN_VALUE && !/^(?:[a-z]+|\d+|-{5}.*)$/i.test(value) && !isPlain(value) && !PLACEHOLDER.test(value);
// A line between a key's or a certificate's first and last line: base64 with a digit, +, / or =, or long.
const pemBody = (line) => {
  const body = PEM_LINE.exec(line)?.[1];
  return body && (body.length >= LONG_WORD || /[\d+/=]/.test(body)) ? body : null;
};
// The path of a hook's link with a number in it, not of a page about hooks (https://example.com/docs/hooks).
function hookPath(word) {
  const at = word.includes('://') ? word.indexOf('/', word.indexOf('://') + 3) : -1;
  const path = at < 0 ? '' : word.slice(at + 1).replace(/\/+$/, '');
  return HOOK.test(word) && /\d/.test(path) && path.length >= MIN_VALUE && !LOCAL_ADDRESS.test(word) ? path : null;
}
const textsOf = (value) => (typeof value === 'string' ? [value]
  : value && typeof value === 'object' && !Array.isArray(value) ? Object.values(value).filter((one) => typeof one === 'string') : []);

/** Every text of a step: its words, an object input's, and its diff's. */
export function stepTexts(item) {
  const diff = item?.diff && typeof item.diff === 'object' ? DIFF_WORDS.map((key) => item.diff[key]) : [item?.diff];
  return [...STEP_WORDS.flatMap((key) => textsOf(item?.[key])), ...diff.filter((text) => typeof text === 'string')].filter(Boolean);
}

/** The password or token of each link in `text`: the password of https://user:password@host, the token of https://token@host. */
export function linkLoginWords(text) {
  const found = new Set();
  for (const [, login] of String(text || '').slice(0, MAX_CHARS).matchAll(LINK_LOGIN)) {
    const at = login.indexOf(':');
    const secret = at < 0 ? login : login.slice(at + 1);
    if (at < 0 ? isTokenShaped(secret) : isSecretValue(secret)) found.add(secret);
  }
  return found;
}

/**
 * Adds to `values` the values of `line`'s settings named for a secret and returns
 * them; a plain setting's name-like value goes in `plain`.
 */
function settingValues(line, values, plain = new Set()) {
  const found = [];
  for (const [, name, quote, value] of line.matchAll(SETTING)) {
    if (!SECRET_NAME.test(name)) {
      if (PLAIN_VALUE.test(value)) plain.add(value);
      continue;
    }
    if (!quote && CODE_VALUE.test(value)) continue;
    const counts = (one) => isSecretValue(one) || (NUMBER_VALUE.test(one) && NUMBER_NAME.test(name));
    // A link's ?key=value&next=1 ends at the "&", though a password may hold one.
    for (const one of [value, value.split('&')[0]].filter(counts)) {
      values.add(one);
      found.push(one);
    }
  }
  return found;
}

/**
 * The words of `text` that look like a key, a password or a token: `values`,
 * of settings named for a secret, of links' logins, of hooks' paths, of the
 * word after Bearer and of a private key's lines, and `tokens`, any other long or mixed word, but
 * for a plain setting's name-like value (AWS_REGION=us-east-1) and a
 * certificate's lines; none when `settingsOnly` (a hidden folder's files).
 * `root`, the task's folder, is no secret.
 */
export function secretLookingWords(text, { root = '', settingsOnly = false } = {}) {
  let raw = String(text || '').slice(0, MAX_CHARS);
  if (root) raw = raw.split(root).join(' ');
  const words = raw.replace(ESCAPES, '\n');
  const values = linkLoginWords(words);
  // A value with a \n of its own (PASSWORD=Xk2\n9sLq) counts whole as well.
  if (words !== raw) for (const line of raw.split('\n')) settingValues(line, values);
  const tokens = new Set();
  let block = null;
  for (const line of words.split('\n')) {
    const edge = PEM_EDGE.exec(line);
    const body = !edge && block ? pemBody(line) : null;
    if (edge) block = edge[1] === 'BEGIN' ? (PUBLIC_PEM.test(edge[2]) ? 'public' : 'key') : null;
    // Each line of a key is secret, however plain; a certificate's lines are not.
    if (body && block === 'key' && body.length >= MIN_VALUE) values.add(body);
    if (body) continue;
    const plain = new Set();
    const secrets = settingValues(line, values, plain);
    for (const [, value] of line.matchAll(AUTH_WORD)) if (isSecretValue(value)) values.add(value);
    for (const piece of line.split(BETWEEN_WORDS)) {
      const word = piece.replace(/[.:]+$/, '').replace(SEARCH_HIT, '');
      if (word.length > MAX_WORD) continue;
      const hook = hookPath(word);
      if (hook) values.add(hook);
      // A plain setting's name-like value stays, but not one inside a secret's value: PASSWORD=mode=made-up1.
      if (settingsOnly || (plain.has(word) && !secrets.some((secret) => secret.includes(word)))) continue;
      for (const part of word.includes('://') ? word.split(LINK_PARTS) : [word]) if (isTokenShaped(part)) tokens.add(part);
    }
  }
  values.delete(HIDDEN_MARK);
  for (const word of [HIDDEN_MARK, ...values]) tokens.delete(word);
  return { values, tokens };
}

const patterns = new WeakMap();
const escaped = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `text` with each of `hidden` shown as HIDDEN_MARK, in one pass, the longest word first where two start together. */
export function withoutHiddenWords(text, hidden = []) {
  if (typeof text !== 'string' || !text || !hidden.length) return text;
  if (!patterns.has(hidden)) patterns.set(hidden, new RegExp(hidden.map(escaped).join('|'), 'g'));
  return text.replace(patterns.get(hidden), HIDDEN_MARK);
}

/** `shown` (a step, a task or a request) with each of `hidden` out of every text a teammate reads in it, marked `hiddenWords` when one was. */
export function withoutHiddenIn(shown, hidden = []) {
  if (!hidden.length || !shown || typeof shown !== 'object') return shown;
  let changed = false;
  const out = (text) => {
    const kept = withoutHiddenWords(text, hidden);
    if (kept !== text) changed = true;
    return kept;
  };
  const kept = { ...shown };
  for (const key of SHOWN_WORDS) if (typeof kept[key] === 'string') kept[key] = out(kept[key]);
  if (kept.diff && typeof kept.diff === 'object') {
    kept.diff = { ...kept.diff };
    for (const key of DIFF_WORDS) if (typeof kept.diff[key] === 'string') kept.diff[key] = out(kept.diff[key]);
  }
  if (Array.isArray(kept.todos)) kept.todos = kept.todos.map((todo) => (typeof todo?.text === 'string' ? { ...todo, text: out(todo.text) } : todo));
  return changed ? { ...kept, hiddenWords: true } : shown;
}
