import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// An agent reads a project's files for whoever drives its chat, and what it
// reads lands in that chat on the shared board. Pat Example owns this
// computer; Sam Example is a teammate. Sam's agent never reads a file only
// Pat opens; Pat's agent reads them all. All files and words are made up.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const PAT = 1;
const SAM = 2;
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: jest.fn(async () => null),
  getSubAgentById: jest.fn(async () => null),
}));

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-agent-reads-')));
const project = path.join(tempRoot, 'made-up-project');
const elsewhere = path.join(tempRoot, 'made-up-elsewhere');
const KEY_WORDS = 'not-a-real-made-up-key';
const inProject = (...parts) => path.join(project, ...parts);

function write(file, words) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, words);
}
write(inProject('notes.md'), 'Made-up note');
write(inProject('.env'), `MADE_UP_KEY=${KEY_WORDS}\n`);
write(inProject('made-up-server.key'), `MADE-UP PRIVATE KEY ${KEY_WORDS}`);
write(inProject('.git', 'config'), `url = https://${KEY_WORDS}@example.invalid/made-up.git\n`);
write(path.join(elsewhere, 'outside-note.md'), 'Made-up words outside the project');
fs.symlinkSync(inProject('.env'), inProject('made-up-link.md'));
fs.symlinkSync(elsewhere, inProject('made-up-elsewhere'));

const agentProject = { id: 'made-up', name: 'made-up', path: project };
// GitHub is made up here: every file read answers with the address it was asked for.
const fetchGithub = jest.fn(async (endpoint) => ({ type: 'file', content: Buffer.from(`Made-up words of ${endpoint}`).toString('base64') }));
jest.unstable_mockModule('../server/tools/helpers.js', () => ({
  resolveProjectForCall: async () => ({ project: agentProject }),
  resolveLocalProjectRoot: async () => agentProject.path,
  fetchGithub,
  localApiUrl: (p) => p,
}));

const { handleProjectsTool } = await import('../server/tools/handlers/projects.js');
const { githubReadFile } = await import('../server/tools/handlers/git/github.js');
const { ownerOnlyProjectRead } = await import('../server/tools/rbac/ownerOnlyReads.js');
const { RUNTIME_MODES } = await import('../server/middleware/runtimeMode.js');
const { FILE_PROBLEMS } = await import('../shared/files/fileProblems.js');

const askAgent = (who, rel, tool = 'project_read') => handleProjectsTool('made-up-agent', tool, { project: 'made-up', path: rel }, { userId: who });

afterAll(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

describe("Sam's agent", () => {
  test('reads an ordinary file in the project', async () => {
    expect(await askAgent(SAM, 'notes.md')).toBe('Made-up note');
  });

  test('gets plain words, never the words, for a file only the owner opens', async () => {
    for (const rel of ['.env', 'made-up-server.key', path.join('.git', 'config'), 'made-up-link.md']) {
      for (const tool of ['project_read', 'project_file_outline']) {
        const said = await askAgent(SAM, rel, tool);
        expect(said).toBe(`Error: ${FILE_PROBLEMS.ownerOnly}`);
      }
    }
  });

  test('reads nothing a link leads to outside the project', async () => {
    expect(await askAgent(SAM, path.join('made-up-elsewhere', 'outside-note.md'))).toBe(`Error: ${FILE_PROBLEMS.outside}`);
  });
});

test("Pat's agent reads them all", async () => {
  expect(await askAgent(PAT, '.env')).toContain(KEY_WORDS);
  expect(await askAgent(PAT, path.join('.git', 'config'))).toContain(KEY_WORDS);
  expect(await askAgent(PAT, path.join('made-up-elsewhere', 'outside-note.md'))).toBe('Made-up words outside the project');
});

describe('in a GitHub project', () => {
  const repoProject = { repo: 'made-up/made-up', path: project };
  const ask = (who, rel) => ownerOnlyProjectRead({ userId: who }, repoProject, rel, { tool: 'project_read' });

  test("Sam's agent gets plain words for a file that holds keys by its name, however it is spelled", async () => {
    for (const rel of ['.env', 'config/made-up-server.key', 'docs/../.env', '.env/.', '.env?x=.md', 'notes.md#.env']) {
      expect(await ask(SAM, rel)).toBe(FILE_PROBLEMS.ownerOnly);
    }
  });

  test("Sam's agent reads an ordinary or example file there, and Pat's agent reads them all", async () => {
    expect(await ask(SAM, 'notes.md')).toBeNull();
    expect(await ask(SAM, '.env.example')).toBeNull();
    expect(await ask(PAT, '.env')).toBeNull();
  });
});

describe('github_read_file, with this computer\'s GitHub key', () => {
  const readAs = (who, args) => githubReadFile({ repo: 'made-up/repo', ...args }, { userId: who });
  beforeEach(() => fetchGithub.mockClear());

  test("Sam's agent gets plain words for a file that holds keys, and GitHub is never asked", async () => {
    for (const path of ['.env', 'made-up/id_ed25519', '.env?ref=made-up', 'notes.md#.env']) {
      expect(await readAs(SAM, { path })).toBe(`Error: ${FILE_PROBLEMS.ownerOnly}`);
    }
    expect(fetchGithub).not.toHaveBeenCalled();
  });

  test("Sam's agent reads an ordinary file, and Pat's agent reads the .env", async () => {
    expect(await readAs(SAM, { path: 'notes.md' })).toBe('Made-up words of /repos/made-up/repo/contents/notes.md');
    expect(await readAs(PAT, { path: '.env' })).toBe('Made-up words of /repos/made-up/repo/contents/.env');
  });

  test('neither the repo nor the path can reach past the repo\'s files', async () => {
    for (const args of [{ repo: 'made-up/repo/contents/.env?', path: 'x' }, { repo: '../user', path: 'x' }, { repo: 'made-up/..', path: 'x' }, { path: '../../../../user' }, { path: 'docs/../.env' }]) {
      expect(await readAs(PAT, args)).toMatch(/^Error: repo must be owner\/name/);
    }
    expect(fetchGithub).not.toHaveBeenCalled();
    expect(await readAs(SAM, { path: 'made up/notes#1.md?x' })).toBe('Made-up words of /repos/made-up/repo/contents/made%20up/notes%231.md%3Fx');
  });
});

test("the desktop app's own work, with no one signed in, is the owner's; on a server it is no one's", async () => {
  const ask = (mode) => ownerOnlyProjectRead({}, agentProject, '.env', { tool: 'project_read', mode });
  expect(await ask(RUNTIME_MODES.LOCAL_DESKTOP)).toBeNull();
  expect(await ask(RUNTIME_MODES.PRIVATE_SERVER)).toBe(FILE_PROBLEMS.ownerOnly);
});

test('a teammate is refused when who is asking cannot be checked', async () => {
  pool.query.mockRejectedValueOnce(new Error('made-up database down'));
  expect(await askAgent(SAM, '.env')).toBe(`Error: ${FILE_PROBLEMS.ownerOnly}`);
});

test("Sam's agent gets plain words for key files a service, a framework or Terraform names, and reads their example", async () => {
  write(inProject('config', 'secrets.yml'), `made_up_key: ${KEY_WORDS}\n`);
  write(inProject('serviceAccountKey.json'), `{"made_up_key":"${KEY_WORDS}"}\n`);
  write(inProject('config', 'secrets.example.json'), '{"made_up_key":""}\n');
  write(inProject('infra', 'terraform.tfstate'), `{"made_up_password":"${KEY_WORDS}"}\n`);
  write(inProject('infra', 'prod.tfvars'), `made_up_password = "${KEY_WORDS}"\n`);
  for (const rel of [path.join('config', 'secrets.yml'), 'serviceAccountKey.json', path.join('infra', 'terraform.tfstate'), path.join('infra', 'prod.tfvars')]) {
    expect(await askAgent(SAM, rel)).toBe(`Error: ${FILE_PROBLEMS.ownerOnly}`);
    expect(await askAgent(PAT, rel)).toContain(KEY_WORDS);
  }
  expect(await askAgent(SAM, path.join('config', 'secrets.example.json'))).toContain('"made_up_key":""');
  fetchGithub.mockClear();
  expect(await githubReadFile({ repo: 'made-up/repo', path: 'infra/terraform.tfvars' }, { userId: SAM })).toBe(`Error: ${FILE_PROBLEMS.ownerOnly}`);
  expect(await githubReadFile({ repo: 'made-up/repo', path: 'infra/terraform.tfstate' }, { userId: SAM })).toBe(`Error: ${FILE_PROBLEMS.ownerOnly}`);
  expect(fetchGithub).not.toHaveBeenCalled();
});
