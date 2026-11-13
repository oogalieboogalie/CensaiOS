// The shapes a file's words come in on a coding agent's console, as Sam
// Example (a teammate) watches a task Pat Example (this computer's owner)
// runs: each CLI's own step fields, the output of searches and diffs in their
// many spellings, and commands that reach a file with a glob or a git
// revision. Sam never sees the words of a file only Pat opens (a .env, a key
// file, anything in a hidden folder), and still sees ordinary files' words.
// All files and words are made up.
import { namesOwnerOnly, permissionForViewer, stepForTeammate } from '../server/cli-agents/ownerOnlySteps.js';
import { wordsForTeammate } from '../server/cli-agents/teammateOutput.js';
import { opencode } from '../server/cli-agents/adapters/opencode.js';
import { gemini } from '../server/cli-agents/adapters/gemini.js';
import { codex } from '../server/cli-agents/adapters/codex.js';
import { copilot } from '../server/cli-agents/adapters/copilot.js';
import { SECRET_CHANGES, UNKNOWN_DIFF } from '../shared/files/fileProblems.js';

const KEY = 'not-a-real-made-up-key';
const ROOT = '/made-up/.censai/worktrees/made-up-task';
const forSam = (item) => stepForTeammate(item, { root: ROOT });
const outputForSam = (output) => forSam({ id: 'c1', kind: 'command', title: 'Run command', command: 'made-up-search', output }).output.split('\n');
const ownerOnlyStep = (item) => expect(forSam(item)).toEqual(expect.objectContaining({ ownerOnly: true }));

describe("each CLI's file steps", () => {
  const openCodeStep = (tool, input, output = '') => opencode.createParser()({
    type: 'tool_use', part: { type: 'tool', tool, callID: `oc-${tool}`, state: { status: 'completed', input, output } },
  })[0].item;

  test("OpenCode's read, write and edit name the file as filePath, so Sam sees only their titles", () => {
    const read = openCodeStep('read', { filePath: `${ROOT}/.env` }, `<file>\n00001| MADE_UP_KEY=${KEY}\n</file>`);
    expect(read).toMatchObject({ kind: 'read', title: 'Read .env', path: `${ROOT}/.env` });
    const write = openCodeStep('write', { filePath: `${ROOT}/.env.production`, content: `MADE_UP_KEY=${KEY}` });
    const edit = openCodeStep('edit', { filePath: `${ROOT}/config/made-up.pem`, oldString: 'made-up old', newString: KEY });
    for (const step of [read, write, edit]) {
      expect(forSam(step)).toMatchObject({ title: step.title, ownerOnly: true });
      expect(JSON.stringify(forSam(step))).not.toContain(KEY);
    }
  });

  test("OpenCode's edit of an ordinary file still shows Sam what changed", () => {
    const edit = openCodeStep('edit', { filePath: `${ROOT}/notes.md`, oldString: 'Made-up note', newString: 'Made-up note, changed' });
    expect(forSam(edit).diff).toEqual({ path: `${ROOT}/notes.md`, before: 'Made-up note', after: 'Made-up note, changed', isNew: false });
  });

  test('a read or write that names no one file shows Sam only its title: Gemini reading several files, an OpenCode patch', () => {
    const many = gemini.createParser()({ type: 'tool_use', tool_id: 'g1', tool_name: 'read_many_files', parameters: { paths: ['notes.md', '.env'] } })[0].item;
    ownerOnlyStep({ ...many, output: `MADE_UP_KEY=${KEY}` });
    ownerOnlyStep({ ...openCodeStep('patch', { patchText: `*** Update File: .env\n+MADE_UP_KEY=${KEY}` }), output: KEY });
  });

  test("a Codex change to several files counts each file, and one to ordinary files stays as it is", () => {
    const change = (paths) => codex.createParser()({
      type: 'item.completed', item: { id: 'x1', type: 'file_change', status: 'completed', changes: paths.map((path) => ({ path, kind: 'update' })) },
    })[0].item;
    ownerOnlyStep(change(['notes.md', '.env']));
    expect(forSam(change(['notes.md', 'src/made-up.js']))).not.toHaveProperty('ownerOnly');
  });

  test('a request to read an ordinary file still shows Sam its file', () => {
    const request = { id: 'p1', title: 'Read notes.md', detail: 'notes.md', kind: 'read', diff: null };
    expect(permissionForViewer(request, { root: ROOT })).toEqual(request);
  });
});

describe('search output in each spelling', () => {
  test("OpenCode's heading for a file, with its numbered lines under it", () => {
    expect(outputForSam(`Found 3 matches\n${ROOT}/.env.production:\n  Line 1: MADE_UP_KEY=${KEY}\n  Line 2: MADE_UP_OTHER=${KEY}\n\n${ROOT}/notes.md:\n  Line 4: MADE_UP_KEY is read here`))
      .toEqual(['Found 3 matches', '.env.production: …', '…', '…', '', 'notes.md:', '  Line 4: MADE_UP_KEY is read here']);
  });

  test("rg's heading with context, where -- between a file's lines keeps them hidden", () => {
    expect(outputForSam(`.env.production\n1:MADE_UP_KEY=${KEY}\n2-MADE_UP_OTHER=${KEY}\n--\n9:MADE_UP_LAST=${KEY}\n\nnotes.md\n4:MADE_UP_KEY is read here`))
      .toEqual(['.env.production', '…', '…', '--', '…', '', 'notes.md', '4:MADE_UP_KEY is read here']);
  });

  test("Gemini's File: heading and its L lines", () => {
    expect(outputForSam(`Found 2 matches:\n---\nFile: .env.production\nL1: MADE_UP_KEY=${KEY}\n---\nFile: notes.md\nL4: MADE_UP_KEY is read here\n---`))
      .toEqual(['Found 2 matches:', '---', 'File: .env.production', '…', '---', 'File: notes.md', 'L4: MADE_UP_KEY is read here', '---']);
  });

  test("git grep's revision before the file, and a Windows path's drive letter", () => {
    expect(outputForSam(`HEAD:.env.production:1:MADE_UP_KEY=${KEY}\nHEAD:.env.production-2-MADE_UP_OTHER=${KEY}\nHEAD:notes.md:4:MADE_UP_KEY is read here`))
      .toEqual(['HEAD:.env.production: …', 'HEAD:.env.production: …', 'HEAD:notes.md:4:MADE_UP_KEY is read here']);
    expect(outputForSam(`C:\\made-up\\.env:1:MADE_UP_KEY=${KEY}\nC:\\made-up\\notes.md:4:MADE_UP_KEY is read here`))
      .toEqual(['C:\\made-up\\.env: …', 'C:\\made-up\\notes.md:4:MADE_UP_KEY is read here']);
  });

  test('a copy or a backup of such a file counts as the file', () => {
    expect(outputForSam(`./.env~:1:MADE_UP_KEY=${KEY}\n./made-up.key.bak:2:${KEY}\n./.env (1):3:${KEY}\n./notes.md.bak:1:Made-up note`))
      .toEqual(['./.env~: …', './made-up.key.bak: …', './.env (1): …', './notes.md.bak:1:Made-up note']);
  });
});

describe('diff output in each spelling', () => {
  const part = (header, oldName, newName, lines) => [header, `--- ${oldName}`, `+++ ${newName}`, '@@ -1 +1 @@', ...lines].join('\n');
  const secret = part('diff --git .env.production .env.production', '.env.production', '.env.production', ['-MADE_UP_KEY=made-up-old', `+MADE_UP_KEY=${KEY}`]);
  const ordinary = part('diff --git notes.md notes.md', 'notes.md', 'notes.md', ['-Made-up note', '+Made-up note, changed']);

  test('with no a/ and b/ (--no-prefix), what changed in such a file is left out', () => {
    const shown = outputForSam(`${secret}\n${ordinary}`).join('\n');
    expect(shown).not.toContain(KEY);
    expect(shown).toContain(`diff --git .env.production .env.production\n${SECRET_CHANGES}`);
    expect(shown).toContain('+Made-up note, changed');
  });

  test('with other prefixes, a hidden folder is left out and a dot-file at the top stays', () => {
    const hidden = part('diff --git c/.made-up/settings.json w/.made-up/settings.json', 'c/.made-up/settings.json', 'w/.made-up/settings.json', ['-{}', `+{"madeUp":"${KEY}"}`]);
    const dotFile = part('diff --git a/.made-up-lint.js b/.made-up-lint.js', 'a/.made-up-lint.js', 'b/.made-up-lint.js', ['-made-up old rule', '+made-up new rule']);
    const shown = outputForSam(`${hidden}\n${dotFile}`).join('\n');
    expect(shown).not.toContain(KEY);
    expect(shown).toContain('+made-up new rule');
  });

  test("a merge's combined diff of such a file is left out, after an ordinary file's", () => {
    const merged = ['diff --cc .env', 'index 1,2..3', '--- a/.env', '+++ b/.env', '@@@ -1,1 -1,1 +1,1 @@@', `++MADE_UP_KEY=${KEY}`].join('\n');
    const shown = outputForSam(`${ordinary}\n${merged}`);
    expect(shown.join('\n')).not.toContain(KEY);
    expect(shown.slice(-3)).toEqual(['diff --cc .env', SECRET_CHANGES, '']);
    expect(shown).toContain('+Made-up note, changed');
  });

  test('a binary patch with no a/ and b/, which has no ---/+++ names, is judged by its header', () => {
    const binary = ['diff --git .made-up/token.bin .made-up/token.bin', 'index 1..2 100644', 'GIT binary patch', 'literal 12', `MADE_UP_KEY=${KEY}`, ''].join('\n');
    expect(outputForSam(binary).join('\n')).not.toContain(KEY);
  });
});

describe('which commands reach a file only the owner opens', () => {
  test.each([
    'cat .env*', 'cat .en?', 'head -n 3 *.pem', 'cat id_*', 'cat .*', 'grep -rn KEY --include=*.env .',
    'git show HEAD:.env.production', 'git show HEAD~1:config/made-up.key', 'cat .env~', 'cp made-up.key.bak /made-up/out',
    // A bare * reaches every file in its folder, a key file among them.
    'cat *', 'head -n 5 config/*',
    // Work inside a hidden folder, whose files then need no dot in their names.
    'cd .git && cat config', 'pushd ~/.ssh && cat config', 'git -C .git cat-file -p HEAD', 'find .git -name config',
    'cat credentials (1).json', 'cat ~/.ssh/id_rsa_github', 'cat deploy_key',
    // A wildcard after a name of its own (server.key, deploy_key), or a copy's mark (id_rsa.bak, .env~).
    'cat certs/server.*', 'head -n 3 certs/localhost.*', 'cat config/master.*', 'cat deploy*', 'cat *_key', 'cat *server*.key', 'cat *.bak', 'cat .*~',
    'cat certs/*-server.*',
    // A brace list bash spells out into several names.
    'cat certs/server.{crt,key}', 'head -n 3 ssl/*.{pem,key}', 'cp id_rsa{,.bak} /made-up/out',
    // More lists than are spelled out: the ones left count as wildcards.
    'cat made-up/{a,b}/{c,d}/{e,f}/{g,h}/server.{crt,key}',
    // Key files a service, a framework or Terraform names, by name or by a wildcard that spells them.
    'cat serviceAccountKey.json', 'cat config/secrets.yml', 'cat infra/terraform.tfvars', 'cat client_secret_*.json',
    'cat made-up-app-firebase-adminsdk-*.json', 'cat *-firebase-adminsdk-*.json', 'cat infra/*.tfvars', 'cat infra/*.auto.tfvars',
    'cat infra/made-up*.tfvars', 'cat config/*.yml', 'head -n 5 *.yaml', 'cat made-up-app-firebase-adminsdk*.json', 'cat infra/prod*.tfvars.json',
  ])('%s does', (command) => expect(namesOwnerOnly(command, { root: ROOT })).toBe(true));

  test.each([
    'ls src/*.js', 'cat notes.md', 'npm test', 'git show HEAD:notes.md', 'cat .env.example.bak', 'git log -3',
    'cat ../package.json', 'grep -rn "process.env" src', 'echo import.meta.env.MODE', 'cd src && cat made-up.js',
    'ls src/*.{js,jsx}', 'git add src/{a,b}.js', 'cat package*.json', 'cat docs/*.md', `curl -d '{"made":1,"up":2}' http://localhost:3001/made-up`,
    "awk '{print $1, $2}' notes.md", 'find . -name made-up.js -exec cat {} +',
    'cat config/secrets.example.json', 'cat config/*.example.json', 'cat firebase.json', 'cat infra/variables.tf',
    // GitHub's settings hold no logins, so its workflows' YAML shows.
    'cat .github/workflows/*.yml', 'ls .github/workflows/*.yaml',
  ])('%s does not', (command) => expect(namesOwnerOnly(command, { root: ROOT })).toBe(false));

  test('a command with more wildcards than are judged one by one counts as reaching such a file', () => {
    expect(namesOwnerOnly(Array.from({ length: 32 }, (_, at) => `src/*.js${at}`).join(' '), { root: ROOT })).toBe(false);
    expect(namesOwnerOnly(Array.from({ length: 33 }, (_, at) => `src/*.js${at}`).join(' '), { root: ROOT })).toBe(true);
  });

  test('a wildcard and a brace list are judged in time that grows only with their length', () => {
    const lists = `${'{a,b}'.repeat(40)}z ${'{'}${'a,'.repeat(20000)}`;
    const many = [Array(32).fill(`${'?*'.repeat(120)}q`).map((g, at) => `${g}${at}`).join(' '), Array(5000).fill(`${'*a'.repeat(127)}z`).join(' ')];
    for (const words of [`${'*'.repeat(200)}z`, `${'*a'.repeat(120)}z`, `${'?*'.repeat(100)}y`, ...many, lists]) {
      const started = Date.now();
      expect(namesOwnerOnly(`cat ${words}`, { root: ROOT })).toBe(false);
      expect(Date.now() - started).toBeLessThan(500);
    }
    // Lists that would spell out more names than are judged count as wildcards, which may reach such a file.
    const started = Date.now();
    expect(namesOwnerOnly(`cat ${`{${'a,'.repeat(100)}b}`.repeat(4)}`, { root: ROOT })).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('the other shapes a key file\'s words come in', () => {
  test("a context line's words never become part of its label, with or without a line number", () => {
    expect(outputForSam(`./.env-3-GH_TOKEN=ghp_madeup:x-oauth-basic\n./.env-MADE_UP_KEY=${KEY}\n./config/made-up.pem-${KEY}\n./notes.md-2-the made-up plan: soon`))
      .toEqual(['./.env: …', './.env: …', './config/made-up.pem: …', './notes.md-2-the made-up plan: soon']);
  });

  test("head's and tail's heading over a key file hides every line under it, up to the next file's heading", () => {
    expect(outputForSam(`==> notes.md <==\nMade-up note\n\n==> config/made-up.key <==\n${KEY}\nMADE_UP_OTHER=${KEY}\n\n==> notes-2.md <==\nMade-up plan`))
      .toEqual(['==> notes.md <==', 'Made-up note', '', '==> config/made-up.key <==', '…', '…', '…', '==> notes-2.md <==', 'Made-up plan']);
  });

  test("a numbered line is a file's words, never a heading for the lines after it", () => {
    expect(outputForSam('notes.md\n3:.env\n4-MADE_UP plan')).toEqual(['notes.md', '3:.env', '4-MADE_UP plan']);
  });

  test('the password or token in a link is left out, in output, a command and a request', () => {
    const remote = `origin\thttps://made-up-user:${KEY}@example.invalid/made-up.git (fetch)\norigin\thttps://${KEY}@example.invalid/made-up.git (push)`;
    expect(outputForSam(remote)).toEqual(['origin\thttps://…@example.invalid/made-up.git (fetch)', 'origin\thttps://…@example.invalid/made-up.git (push)']);
    const clone = forSam({ id: 'c2', kind: 'command', title: 'Clone', command: `git clone https://${KEY}@example.invalid/made-up.git`, output: '' });
    expect(clone.command).toBe('git clone https://…@example.invalid/made-up.git');
    const request = { id: 'p2', title: 'Run a command', detail: `git push https://made-up-user:${KEY}@example.invalid/made-up.git`, kind: 'command', diff: null };
    expect(JSON.stringify(permissionForViewer(request, { root: ROOT }))).not.toContain(KEY);
  });

  test("a diff cut off from its header (git diff | tail), or with a header git's filter cannot read, is left out", () => {
    expect(outputForSam(`Made-up summary\n@@ -1 +1 @@\n-MADE_UP_KEY=made-up-old\n+MADE_UP_KEY=${KEY}`)).toEqual(['Made-up summary', UNKNOWN_DIFF, '']);
    const graph = ['* made-up commit', '| diff --git a/.env b/.env', '| --- a/.env', '| +++ b/.env', '| @@ -1 +1 @@', `| +MADE_UP_KEY=${KEY}`].join('\n');
    expect(outputForSam(graph).join('\n')).not.toContain(KEY);
    const plainDiff = ['diff -ru made-up-a/.env made-up-b/.env', '--- made-up-a/.env\t2026-01-01', '+++ made-up-b/.env\t2026-01-02', '@@ -1 +1 @@', `+MADE_UP_KEY=${KEY}`].join('\n');
    expect(outputForSam(plainDiff).join('\n')).not.toContain(KEY);
  });

  test("a coloured diff of a key file is left out, and an ordinary file's diff that mentions one stays whole", () => {
    const ESC = String.fromCharCode(27);
    const coloured = [`${ESC}[1mdiff --git a/.env b/.env${ESC}[m`, `${ESC}[1m--- a/.env${ESC}[m`, `${ESC}[1m+++ b/.env${ESC}[m`, `${ESC}[36m@@ -1 +1 @@${ESC}[m`, `${ESC}[32m+MADE_UP_KEY=${KEY}${ESC}[m`].join('\n');
    expect(outputForSam(coloured)).toEqual(['diff --git a/.env b/.env', SECRET_CHANGES, '']);
    const readme = [
      'diff --git a/README.md b/README.md', '--- a/README.md', '+++ b/README.md', '@@ -1,2 +1,2 @@', ' Copy .env.example to .env: then fill it in',
      '-Made-up: see .git/config-old', '\\ No newline at end of file', '+Made-up: set MADE_UP_KEY in .env: it is read at start', '\\ No newline at end of file',
    ];
    expect(outputForSam([...readme, `./.env:1:MADE_UP_KEY=${KEY}`].join('\n'))).toEqual([...readme, './.env: …']);
    const merged = ['diff --cc README.md', 'index 1,2..3', '--- a/README.md', '+++ b/README.md', '@@@ -1,1 -1,1 +1,1 @@@', '++Made-up: set MADE_UP_KEY in .env: it is read at start', '- Made-up: see .git/config-old'];
    expect(outputForSam(merged.join('\n'))).toEqual(merged);
  });

  test("a hunk's lines are as many as its header counts, so a line after them, or after a hunk cut short, is judged again", () => {
    const hunk = ['diff --git a/notes.md b/notes.md', '--- a/notes.md', '+++ b/notes.md', '@@ -1,2 +1,2 @@', ' Made-up title', '-Made-up note', '+Made-up note, changed'];
    expect(outputForSam([...hunk, ` ./.env:1:MADE_UP_KEY=${KEY}`].join('\n'))).toEqual([...hunk, './.env: …']);
    const cut = ['diff --git a/notes.md b/notes.md', '@@ -1,3 +1,3 @@', ' Made-up title', 'Made-up summary'];
    expect(outputForSam([...cut, ` ./.env:1:MADE_UP_KEY=${KEY}`].join('\n'))).toEqual([...cut, './.env: …']);
  });

  test("the worktree's folder is taken out of every path, and a folder above it is not hidden", () => {
    expect(outputForSam(`Error: made-up\n    at ${ROOT}/src/made-up.js:3:9\n../package.json:1:{"name":"made-up"}`))
      .toEqual(['Error: made-up', '    at src/made-up.js:3:9', '../package.json:1:{"name":"made-up"}']);
  });

  test("git's a/ before the worktree's folder keeps the path whole (git diff --no-index), so a key file there is still judged by it", () => {
    const inside = ROOT.slice(1);
    const noIndex = [`diff --git a/${inside}/.env.local b/${inside}/.env.local`, 'new file mode 100644', '--- /dev/null', `+++ b/${inside}/.env.local`, '@@ -0,0 +1 @@', `+MADE_UP_KEY=${KEY}`];
    expect(outputForSam(noIndex.join('\n')).join('\n')).not.toContain(KEY);
  });

  test("diff's heading over two folders' files hides a key file's lines in each of its formats, up to the next file's heading", () => {
    const pair = (how, lines) => [`diff ${how} made-up-a/.env made-up-b/.env`, ...lines];
    const ordinary = ['diff -r made-up-a/notes.md made-up-b/notes.md', '1c1', '< Made-up note', '---', '> Made-up note, changed'];
    for (const secret of [
      pair('-r', ['1c1', '< MADE_UP_KEY=made-up-old', '---', `> MADE_UP_KEY=${KEY}`]),
      pair('-rc', ['*** made-up-a/.env', '--- made-up-b/.env', '***************', '*** 1 ****', '! MADE_UP_KEY=made-up-old', '--- 1 ----', `! MADE_UP_KEY=${KEY}`]),
      pair('-ry', [`MADE_UP_KEY=made-up-old\t\t|\tMADE_UP_KEY=${KEY}`]),
    ]) {
      expect(outputForSam([...secret, ...ordinary].join('\n'))).toEqual([secret[0], ...secret.slice(1).map(() => '…'), ...ordinary]);
    }
    // A file in a hidden folder compared with its copy elsewhere counts too.
    const hidden = ['diff -r .made-up/settings.json made-up-copy/settings.json', '1c1', `< {"madeUp":"${KEY}"}`, '---', '> {}'];
    expect(outputForSam(hidden.join('\n'))).toEqual([hidden[0], '…', '…', '…', '…']);
  });

  test('a search line that a hunk cut short still seemed to count is cut all the same', () => {
    const cut = ['diff --git a/notes.md b/notes.md', '--- a/notes.md', '+++ b/notes.md', '@@ -1,40 +1,40 @@', ' Made-up title'];
    expect(outputForSam([...cut, `  ./.env:1:MADE_UP_KEY=${KEY}`].join('\n'))).toEqual([...cut, ' ./.env: …']);
  });

  test('a long link-like or dotted line is judged in time that grows only with its length', () => {
    for (const text of [`made-up://${'a.'.repeat(40000)}`, 'a.'.repeat(40000), `${'made-up://'.repeat(4000)}${'a.'.repeat(40000)}`]) {
      const started = Date.now();
      outputForSam(text);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });

  test('each part of a line with many ":" in it is judged once, not again for each ":" after it', () => {
    let judged = 0;
    const ownerOnly = () => { judged += 1; return false; };
    wordsForTeammate(`${'.'.repeat(250)}${'a:'.repeat(64)}`, { ownerOnly });
    expect(judged).toBeLessThan(3 * 64);
  });
});

describe('what an agent prints and says', () => {
  test("Copilot's printed lines are judged as a command's output", () => {
    const parse = copilot.createParser();
    const message = parse(null, `./.env:1:MADE_UP_KEY=${KEY}`)[0].item;
    expect(message.printed).toBe(true);
    expect(opencode.createParser()(null, 'Made-up plain line')[0].item.printed).toBe(true);
    // A context line with no line number is cut only in output: in what an agent says, it could be a sentence.
    expect(forSam({ ...message, text: `${message.text}\n./.env-MADE_UP_OTHER=${KEY}` }).text).toBe('./.env: …\n./.env: …');
  });

  test('what an agent says keeps its sentences, and loses a quoted search line and a link login', () => {
    const said = forSam({ id: 'm1', kind: 'message', role: 'assistant', text: `I set it up in .env: see line 1.\n./.env:1:MADE_UP_KEY=${KEY}\nPushed to https://${KEY}@example.invalid` });
    expect(said.text).toBe('I set it up in .env: see line 1.\n./.env: …\nPushed to https://…@example.invalid');
  });

  test('what an agent says loses a hunk it quotes with no file named, and keeps what comes after it', () => {
    const text = ['Changed the delay:', '```diff', '@@ -10,3 +10,3 @@', ' const made = 1;', '', '-const delay = 100;', `+const delay = 250; // ${KEY}`, '```', 'Then the made-up tests pass.'].join('\n');
    const said = forSam({ id: 'm2', kind: 'message', role: 'assistant', text }).text;
    expect(said.split('\n')).toEqual(['Changed the delay:', '```diff', UNKNOWN_DIFF, '```', 'Then the made-up tests pass.']);
    // In output the rest stays out: a diff cut off from its header could be in any of git's formats.
    expect(outputForSam(text).slice(-2)).toEqual([UNKNOWN_DIFF, '']);
  });

  test('a step titled with its own command shows a plain title, and a step with odd fields does not fail', () => {
    expect(forSam({ id: 'g1', kind: 'command', title: `cat .env && echo ${KEY}`, command: `cat .env && echo ${KEY}`, output: KEY }))
      .toEqual({ id: 'g1', kind: 'command', title: 'Run a command', ownerOnly: true });
    expect(forSam({ id: 'g2', kind: 'command', title: '`echo MADE_UP_KEY=not-a-re…`', command: `echo MADE_UP_KEY=${KEY} >> .env` }).title).toBe('Run a command');
    expect(forSam({ id: 'g3', kind: 'command', title: 'Add the made-up key', command: `echo MADE_UP_KEY=${KEY} >> .env` }).title).toBe('Add the made-up key');
    expect(forSam({ id: 'e1', kind: 'edit', title: 'Edit', files: 'made-up' })).toMatchObject({ ownerOnly: true });
  });
});
