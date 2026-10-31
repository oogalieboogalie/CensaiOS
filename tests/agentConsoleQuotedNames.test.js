// A coding agent's command that names a file only this computer's owner opens
// in quotes, or with a backslash before each space, as Sam Example (a
// teammate) watches a task Pat Example (the owner) runs. bash hands the
// command the whole name, so the name is judged whole too, and Sam sees only
// the step's title. All files and words are made up.
import { namesOwnerOnly, permissionForViewer, stepForTeammate } from '../server/cli-agents/ownerOnlySteps.js';
import { shellWords } from '../server/cli-agents/shellWords.js';

const KEY = 'not-a-real-made-up-key';
const ROOT = '/made-up/.censai/worktrees/made-up-task';
const reaches = (command) => namesOwnerOnly(command, { root: ROOT });

describe('the words bash hands a command', () => {
  test.each([
    ['cat "server (1).pem"', ['cat', 'server (1).pem'], ['server (1).pem']],
    ["cat 'secrets copy.json'", ['cat', 'secrets copy.json'], ['secrets copy.json']],
    ['cat server\\ \\(1\\).pem', ['cat', 'server (1).pem'], []],
    ['cat "server (1)".pem', ['cat', 'server (1).pem'], ['server (1)']],
    ["cat $'made up\\'s.pem'", ['cat', "made up's.pem"], ["made up's.pem"]],
    ['echo "a \\"made-up\\" word" \'it\'\\\'\'s\' "" x', ['echo', 'a "made-up" word', "it's", '', 'x'], ['a "made-up" word', 'it', 's', '']],
    ['cd "made up/.ssh" && cat config;ls|wc -l', ['cd', 'made up/.ssh', 'cat', 'config', 'ls', 'wc', '-l'], ['made up/.ssh']],
    ['cat made\\\nup.md', ['cat', 'madeup.md'], []],
    ['echo "a quote left open', ['echo', 'a quote left open'], ['a quote left open']],
    ['{"file":"made up/server (1).pem"}', ['{file:made up/server (1).pem}'], ['file', 'made up/server (1).pem']],
  ])('%s', (command, words, quoted) => expect(shellWords(command)).toEqual({ words, quoted }));
});

describe('a file only the owner opens, named whole in quotes or with backslashes', () => {
  test.each([
    'cat "server (1).pem"', "cat 'secrets copy.json'", 'cat "id_rsa - Copy"', 'cat server\\ \\(1\\).pem', 'cat "server (1)".pem',
    'cat ./"secrets copy.json"', `cat '${ROOT}/certs/made up.key'`, 'head -n 3 "config/secrets (2).yml"', 'cp ".env copy" /made-up/out',
    "cat $'deploy key (1).pem'",
    // Work inside a hidden folder whose path has a space in it.
    'cd "made up/.ssh" && cat config', 'git -C "made up/.git" cat-file -p HEAD', 'find "made up/.git" -name config',
    // A tool's input in JSON names the file in quotes.
    '{"source":"made up/server (1).pem"}', `{"source":"${ROOT}/secrets copy.json"}`,
  ])('%s does', (command) => expect(reaches(command)).toBe(true));

  test.each([
    'cat "notes (1).md"', "cat 'meeting notes copy.txt'", 'git commit -m "Fix the server (1) page"', 'ls "made up folder"',
    `cat "${ROOT}/notes (1).md"`, 'cat "made up/.github/workflows/ci (1).yml"', 'git commit -m "Tidy the eslint settings and README"',
    // A tool's input in JSON with the worktree's own path, which sits in a hidden folder.
    `{"notebook_path":"${ROOT}/made up.ipynb","new_source":"print(1)"}`,
  ])('%s does not', (command) => expect(reaches(command)).toBe(false));
});

describe('what Sam sees', () => {
  test("a command naming a key file in quotes shows Sam only its title, and one naming an ordinary file in quotes shows whole", () => {
    const secret = { id: 'c1', kind: 'command', title: 'Show the made-up certificate', command: 'cat "certs/server (1).pem"', output: `MADE_UP_PEM=${KEY}`, status: 'done' };
    expect(stepForTeammate(secret, { root: ROOT })).toEqual({ id: 'c1', kind: 'command', title: 'Show the made-up certificate', status: 'done', ownerOnly: true });
    const plain = { id: 'c2', kind: 'command', title: 'Show the made-up notes', command: 'cat "notes (1).md"', output: 'Made-up notes', status: 'done' };
    expect(stepForTeammate(plain, { root: ROOT })).toEqual(plain);
  });

  test('a request to run one shows Sam its title only', () => {
    const request = { id: 'p1', taskId: 'made-up-task', title: 'Run a command', detail: "cat 'secrets copy.json'", kind: 'command', diff: null, input: { command: "cat 'secrets copy.json'" } };
    expect(permissionForViewer(request, { root: ROOT })).toEqual({ id: 'p1', taskId: 'made-up-task', title: 'Run a command', detail: null, kind: 'command', diff: null, ownerOnly: true });
  });

  test('a long command, with a quote left open or many quotes, is read in time that grows only with its length', () => {
    for (const command of [`cat "${'made up '.repeat(20000)}`, `cat ${'"a b" '.repeat(20000)}`, `cat ${'\\ '.repeat(40000)}x.md`, `echo '${'{a,b}'.repeat(5000)}'`]) {
      const started = Date.now();
      expect(reaches(command)).toBe(false);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });
});
