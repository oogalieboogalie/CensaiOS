/**
 * Which words of what a teammate could not see in a coding agent's task are
 * hidden from them everywhere else in it (server/cli-agents/hiddenWords.js),
 * and that a task's hidden words are worked out once per change
 * (server/cli-agents/taskHiddenWords.js). All keys, files and words are made up.
 */
import { secretLookingWords, withoutHiddenIn, withoutHiddenWords } from '../server/cli-agents/hiddenWords.js';
import { stepForTeammate } from '../server/cli-agents/ownerOnlySteps.js';
import { taskHiddenTiers, taskHiddenWords } from '../server/cli-agents/taskHiddenWords.js';
import { HIDDEN_MARK } from '../shared/files/fileProblems.js';

const KEY = 'made-up-key-0123456789';
const OTHER = 'made-up-production-4242';
const TOKEN = 'made-up-token-777';
const ROOT = '/made-up/worktree';
const words = (text, options) => {
  const { values, tokens } = secretLookingWords(text, options);
  return [...values, ...tokens];
};
// A key's first and last line, put together here so no file holds one.
const edge = (word, kind) => `-----${word} ${kind}-----`;
const made = (items, more = {}) => ({
  id: 'made-up-task', rev: items.length, permissions: [], worktree: { dir: ROOT }, ...more,
  items: items.map((item, i) => ({ id: `i${i}`, rev: i + 1, ...item })),
});
const seenBySam = (task, index) => stepForTeammate(task.items[index], { root: ROOT, hidden: taskHiddenWords(task) });

test("a task's hidden words are worked out once per change, and a word stays hidden once it was", () => {
  const read = { id: 'i1', kind: 'read', title: 'Read .env', path: '.env', output: `MADE_UP_KEY=${KEY}`, rev: 1 };
  const task = { id: 'made-up-task', rev: 1, items: [read], permissions: [], worktree: { dir: '/made-up/worktree' } };
  const first = taskHiddenWords(task);
  expect(first).toEqual([KEY]);
  expect(taskHiddenWords(task)).toBe(first);
  // The read falls off the end of a long transcript; a link with a made-up token comes in.
  Object.assign(task, { rev: 2, items: [{ id: 'i2', kind: 'command', title: 'Add a remote', command: `git remote add made-up https://made-up-user:${TOKEN}@example.invalid/made-up.git`, rev: 2 }] });
  expect(taskHiddenWords(task)).toEqual([KEY, TOKEN]);
});

describe('which words look like a key', () => {
  test('values of key settings, link passwords and long or mixed words; not names, files, addresses, short values or plain words', () => {
    const text = [
      `MADE_UP_KEY=${KEY}`,
      'MADE_UP_PASSWORD=made-up-words',
      'echo MADE_UP_SECRET=hunter-two >> .env',
      '  "made_up_token": "made-up-json-words",',
      'NEXT_PUBLIC_SITE_NAME=Made-up Shop',
      'PORT=3001',
      `DATABASE_URL=postgres://made-up-user:${TOKEN}@localhost/made-up`,
      'notes.md:12: see made-up-plans/made-up-budget.md for the settings',
    ].join('\n');
    const found = words(text);
    expect(found).toEqual(expect.arrayContaining([KEY, 'made-up-words', 'hunter-two', 'made-up-json-words', TOKEN]));
    for (const word of ['MADE_UP_KEY', 'NEXT_PUBLIC_SITE_NAME', 'Made-up', 'Shop', '3001', 'made-up-user', 'localhost', 'notes.md:12', 'made-up-plans/made-up-budget.md', 'settings']) expect(found).not.toContain(word);
  });

  test('a plain-letter password, an address on this computer and a name in a key setting are too common to hide everywhere', () => {
    const text = [
      'POSTGRES_PASSWORD=postgres',
      'LOCAL_DATABASE_URL=postgres://postgres:postgres@localhost:5432/made-up',
      'APP_URL=http://localhost:3000',
      'REDIS_HOST=redis:6379',
      'AUTH_PROVIDER=github',
      'SORT_KEY=created_at',
      'TOKEN_FILE=./made-up/token.txt',
    ].join('\n');
    expect(words(text)).toEqual([]);
  });

  test('a region, a bucket, a number and a link to a page are no key either', () => {
    const text = [
      'AWS_REGION=us-east-1',
      'AWS_S3_BUCKET=made-up-bucket-2024',
      'MADE_UP_ORDER_COUNT=12345678901',
      'See https://example.invalid/made-up-docs/settings-page for more.',
    ].join('\n');
    expect(words(text)).toEqual([]);
  });

  test("a key setting counts after any mark: a diff's +, a search's file and line, Claude Code's line numbers, JSON's \\n, another setting", () => {
    const text = [
      '+MADE_UP_SECRET=hunter-two',
      '.env.production:3:MADE_UP_PRODUCTION_KEY=made-up-prod',
      '     1→ADMIN_PASSWORD=made-up-pw1',
      '{"made_up_settings": "MADE_UP_API_KEY=made-up-json1\\nMADE_UP_MODE=fast"}',
      'MADE_UP_PASSWORD=mode=made-up2',
    ].join('\n');
    const { values, tokens } = secretLookingWords(text);
    expect([...values]).toEqual(expect.arrayContaining(['hunter-two', 'made-up-prod', 'made-up-pw1', 'made-up-json1', 'mode=made-up2']));
    for (const word of ['MADE_UP_MODE', 'fast', 'MADE_UP_MODE=fast']) expect([...values, ...tokens]).not.toContain(word);
    // The part after "mode=" is no plain setting's value: it is hidden on its own too.
    expect([...tokens]).toContain('made-up2');
  });

  test('a password or a pin may be a number; another setting\'s number is no key', () => {
    expect(words('ADMIN_PIN=482913\nMADE_UP_DB_PASSWORD=58203917\nSESSION_MAX_AGE=2592000\nMADE_UP_ORDER_LIMIT=250000')).toEqual(['482913', '58203917']);
  });

  test('a password with a \\n of its own is hidden whole, as well as in its two parts', () => {
    const PASSWORD = 'Xk2\\n9sLq7Zp!';
    const task = made([
      { kind: 'read', title: 'Read .env', path: '.env', output: `     1→MADE_UP_DB_PASSWORD=${PASSWORD}` },
      { kind: 'message', role: 'assistant', text: `The database password is ${PASSWORD} and its end is 9sLq7Zp!.` },
    ]);
    expect(seenBySam(task, 1).text).toBe(`The database password is ${HIDDEN_MARK} and its end is ${HIDDEN_MARK}.`);
  });

  test("a link's login and a token in its path are hidden, its address and a page in it are not", () => {
    const PATH_TOKEN = 'madeUpPathToken0123456789';
    const text = `git remote add made-up https://made-up-user:${TOKEN}@example.invalid/made-up.git && curl https://example.invalid/made-up-files/${PATH_TOKEN}`;
    expect(words(text)).toEqual([TOKEN, `made-up-user:${TOKEN}`, PATH_TOKEN]);
    const hidden = words(text).sort((a, b) => b.length - a.length);
    expect(withoutHiddenWords(text, hidden)).toBe(`git remote add made-up https://${HIDDEN_MARK}@example.invalid/made-up.git && curl https://example.invalid/made-up-files/${HIDDEN_MARK}`);
    // A plain-letter password is hidden with its user in a long link; a short local one stays.
    expect(words('MADE_UP_DB=mongodb+srv://made-up-user:quietmeadowlark@cluster0.example.com/shop')).toEqual(['made-up-user:quietmeadowlark']);
    expect(words('MADE_UP_DB=postgres://made_up:58203917@db.example.com/shop')).toEqual(['made_up:58203917']);
  });

  test("a hook's link is a key in its path, however short its parts, also in a hidden folder's files; a page about hooks is not", () => {
    const text = 'MADE_UP_ORDER_HOOK=https://hooks.example.com/catch/1234567/abc1de2/';
    expect(words(text)).toEqual(['catch/1234567/abc1de2']);
    expect(words(`notify = "${text.split('=')[1]}"`, { settingsOnly: true })).toEqual(['catch/1234567/abc1de2']);
    expect(withoutHiddenWords("fetch('https://hooks.example.com/catch/1234567/abc1de2')", ['catch/1234567/abc1de2'])).toBe(`fetch('https://hooks.example.com/${HIDDEN_MARK}')`);
    expect(words('See https://example.com/docs/hooks and http://localhost:3000/hooks/1 for more.')).toEqual([]);
  });

  test("any setting's value that looks like a key is hidden; a plain setting's name-like value stays", () => {
    const text = [
      'MADE_UP_MAIL_LOGIN=Xk29sLq7Zp',
      'MADE_UP_ACCESS_CODE=ab12cd34',
      'SMTP_PW=hunter-two',
      'WIFI_PSK=correct-horse-battery-staple',
      'S3_BUCKET=made-up-uploads-2024',
      'MADE_UP_IMAGE=node:20-alpine',
    ].join('\n');
    expect(words(text)).toEqual(['hunter-two', 'correct-horse-battery-staple', 'Xk29sLq7Zp', 'ab12cd34']);
  });

  test("code, a stand-in and a setting's name read in code are no key", () => {
    const code = [
      'const session = useSession();const token = getToken(req);',
      'const secret = crypto.randomBytes(32); const key = req.headers[name];',
      'const url = process.env.DATABASE_URL; const site = import.meta.env.VITE_MADE_UP_SITE_NAME;',
      'MADE_UP_KEY=${MADE_UP_OTHER_KEY}',
      'const password = "made-up(9)";',
    ].join('\n');
    expect(words(code)).toEqual(['made-up(9)']);
  });

  test('the word after Bearer or Basic is a key, also in a hidden folder\'s files', () => {
    const text = 'Authorization: Bearer madeUp0123456789abcdefTOKEN\ncurl -H "Authorization: Basic bWFkZS11cDpwYXNz" https://example.invalid';
    expect(words(text, { settingsOnly: true })).toEqual(['madeUp0123456789abcdefTOKEN', 'bWFkZS11cDpwYXNz']);
    expect(words('Bearer tokens expire; the basic plan is fine.')).toEqual([]);
  });

  test("a key's lines count, also as JSON's one long line; a certificate's do not", () => {
    const L1 = 'MadeUpKeyLineOne0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL';
    const L2 = 'MadeUpKeyLineTwo0123456789';
    const json = `{"made_up_private_key": "${edge('BEGIN', 'PRIVATE KEY')}\\n${L1}\\n${L2}\\n${edge('END', 'PRIVATE KEY')}\\n"}`;
    expect(words(json)).toEqual([L1, L2]);
    const certificate = [edge('BEGIN', 'CERTIFICATE'), 'MadeUpCertificateLine0123456789abcdefghijklmnopqrstuvwxyzABCDEF', edge('END', 'CERTIFICATE')].join('\n');
    expect(words(certificate)).toEqual([]);
  });

  test("a private key's lines count wherever it is read, with Claude Code's line numbers, and however plain its last line", () => {
    const L1 = 'MadeUpKeyLineOne0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL';
    const read = [edge('BEGIN', 'OPENSSH PRIVATE KEY'), L1, 'AbC9+/==', edge('END', 'OPENSSH PRIVATE KEY'), 'Done reading it.']
      .map((line, i) => `     ${i + 1}→${line}`).join('\n');
    // In a hidden folder's file (~/.ssh/made_up_deploy) as well.
    expect(words(read, { settingsOnly: true })).toEqual([L1, 'AbC9+/==']);
    const searched = [edge('BEGIN', 'PRIVATE KEY'), L1, edge('END', 'PRIVATE KEY')].map((line, i) => `./made-up.pem:${i + 1}:${line}`).join('\n');
    expect(words(searched, { settingsOnly: true })).toEqual([L1]);
    // A line a search found on its own is judged without its file and line.
    expect(words(`./made-up.pem:2:${L1}`)).toEqual([L1]);
  });

  test("the task's own folder is no secret", () => {
    const root = '/made-up/.homebase-state/cli-agents/worktrees/made-up-repo/task-0123456789';
    expect(words(`${root}/config.js`, { root })).toEqual([]);
  });

  test('each hidden word is replaced wherever it comes back, the longest first', () => {
    const hidden = ['made-up-key-0123456789', 'made-up-key-0123'];
    expect(withoutHiddenWords('made-up-key-0123456789 and made-up-key-0123', hidden)).toBe(`${HIDDEN_MARK} and ${HIDDEN_MARK}`);
    const step = { title: 'Plan', todos: [{ text: `Use ${KEY}`, status: 'pending' }], diff: { path: 'a.js', before: '', after: KEY } };
    expect(withoutHiddenIn(step, [KEY])).toEqual({ ...step, todos: [{ text: `Use ${HIDDEN_MARK}`, status: 'pending' }], diff: { path: 'a.js', before: '', after: HIDDEN_MARK }, hiddenWords: true });
    const plain = { title: 'Read notes.md', output: 'Made-up note' };
    expect(withoutHiddenIn(plain, [KEY])).toBe(plain);
  });
});

describe("a task's hidden words", () => {
  test('a password read with Claude Code\'s line numbers is hidden where the agent says it', () => {
    const task = made([
      { kind: 'read', title: 'Read .env', path: '.env', output: '     1→ADMIN_PASSWORD=hunter-two\n     2→MADE_UP_JWT_SECRET=made-up!' },
      { kind: 'message', role: 'assistant', text: 'Log in with hunter-two; the JWT secret is made-up!.' },
    ]);
    expect(seenBySam(task, 1).text).toBe(`Log in with ${HIDDEN_MARK}; the JWT secret is ${HIDDEN_MARK}.`);
  });

  test('a private key read from a JSON file is hidden line by line where the agent copies it', () => {
    const L1 = 'MadeUpKeyLineOne0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL';
    const L2 = 'MadeUpKeyLineTwo0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJK';
    const json = `{\n  "type": "made_up_account",\n  "private_key": "${edge('BEGIN', 'PRIVATE KEY')}\\n${L1}\\n${L2}\\n${edge('END', 'PRIVATE KEY')}\\n"\n}`;
    const copied = (line1, line2) => `export const key = \`${edge('BEGIN', 'PRIVATE KEY')}\n${line1}\n${line2}\n${edge('END', 'PRIVATE KEY')}\`;\n`;
    const task = made([
      { kind: 'read', title: 'Read credentials.json', path: 'credentials.json', output: json },
      { kind: 'edit', title: 'Write src/admin.ts', path: 'src/admin.ts', diff: { path: 'src/admin.ts', before: '', after: copied(L1, L2) } },
    ]);
    expect(seenBySam(task, 1).diff.after).toBe(copied(HIDDEN_MARK, HIDDEN_MARK));
  });

  test("a hidden folder's own files give only settings' and links' values, so a commit id stays readable", () => {
    const COMMIT = '0123456789abcdef0123456789abcdef01234567';
    const task = made([
      { kind: 'command', title: 'List the tags', command: 'cat .git/packed-refs', output: `${COMMIT} refs/tags/v1.0.0\n` },
      { kind: 'command', title: "Show the made-up tool's settings", command: 'cat .made-up-tool/settings', output: `made_up_token = ${TOKEN}\nmade_up_cache = ${COMMIT}\n` },
      { kind: 'read', title: 'Read .env', path: '.env', output: `MADE_UP_KEY=${KEY}` },
      { kind: 'command', title: 'Show the last commit', command: 'git log -1 --format=%H', output: `${COMMIT}\n` },
    ]);
    expect(taskHiddenWords(task)).toEqual([KEY, TOKEN]);
    expect(seenBySam(task, 3).output).toBe(`${COMMIT}\n`);
  });

  test('past 500 words, settings\' keys come before a pile of long words, and a hand-off keeps them', () => {
    const pile = Array.from({ length: 520 }, (_, i) => `madeupword${String(i).padStart(4, '0')}x`).join('\n');
    const task = made([
      { kind: 'read', title: 'Read credentials.json', path: 'credentials.json', output: pile },
      { kind: 'read', title: 'Read .env', path: '.env', output: `MADE_UP_KEY=${KEY}` },
    ]);
    const hidden = taskHiddenWords(task);
    expect(hidden).toHaveLength(500);
    expect(hidden).toContain(KEY);
    // A task handed these changes hides them too, and its own key on top, settings' keys still first.
    const handed = taskHiddenTiers(task);
    expect(handed).toMatchObject({ values: [KEY] });
    expect(handed.tokens).toHaveLength(499);
    const review = made([
      { kind: 'read', title: 'Read .env.local', path: '.env.local', output: `MADE_UP_OTHER_KEY=${OTHER}` },
      { kind: 'read', title: 'Read credentials.json', path: 'credentials.json', output: pile.replaceAll('madeupword', 'madeupother') },
    ], { id: 'made-up-review', handoffHidden: handed });
    expect(taskHiddenWords(review)).toEqual(expect.arrayContaining([KEY, OTHER]));
  });

  test("a file in a folder that holds sign-ins (~/.local, ~/.config) gives all its long words", () => {
    const REFRESH = 'rt-MadeUp0123456789abcdef';
    const task = made([
      { kind: 'read', title: 'Read state.json', path: '/home/made-up/.local/share/made-up-cli/state.json', output: `{"refresh": "${REFRESH}", "expires": 1767225600}` },
      { kind: 'message', role: 'assistant', text: `The made-up CLI is signed in (${REFRESH}).` },
    ]);
    expect(taskHiddenWords(task)).toEqual([REFRESH]);
    expect(seenBySam(task, 1).text).toBe(`The made-up CLI is signed in (${HIDDEN_MARK}).`);
  });
});
