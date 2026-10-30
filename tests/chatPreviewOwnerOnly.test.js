import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as Y from 'yjs';

// The live preview beside a chat sits on the shared board, so it never shows
// a file only this computer's owner opens (a .env, a key file, anything in a
// hidden folder, a link out of the project), nor pulls one into a page,
// whoever's agent asks. All files and words are made up.
const KEY = 'not-a-real-made-up-key';
const pool = { query: jest.fn(async () => ({ rows: [{ id: 'made-up-board', name: 'Made-up board', role: 'member' }] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/memory.js', () => ({ getSubAgentById: jest.fn(async () => null) }));
const ghGetFile = jest.fn(async (_repo, rel) => `Made-up words of ${rel}`);
jest.unstable_mockModule('../server/github.js', () => ({ getFile: ghGetFile, isRepoName: () => true }));

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-preview-owner-only-')));
const project = path.join(tempRoot, 'made-up-project');
const elsewhere = path.join(tempRoot, 'made-up-elsewhere');
function write(file, words) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, words);
}
write(path.join(project, 'notes.md'), '# Made-up note');
write(path.join(project, '.env'), `MADE_UP_KEY=${KEY}\n`);
write(path.join(project, '.made-up', 'page.html'), `<h1>Made-up hidden page ${KEY}</h1>`);
write(path.join(project, '.made-up', 'style.css'), `h1::after{content:"${KEY}"}`);
write(path.join(project, 'style.css'), 'h1{font-weight:600}');
write(path.join(project, 'index.html'), '<link rel="stylesheet" href="style.css"><link rel="stylesheet" href=".made-up/style.css"><script src=".env"></script><h1>Made-up page</h1>');
write(path.join(elsewhere, 'outside.md'), `# Made-up words outside ${KEY}`);
fs.symlinkSync(path.join(project, '.env'), path.join(project, 'made-up-link.md'));
fs.symlinkSync(path.join(elsewhere, 'outside.md'), path.join(project, 'made-up-outside.md'));

const localProject = { id: 'made-up', name: 'made-up', path: project };
const githubProject = { id: 'made-up-gh', name: 'made-up-gh', repo: 'made-up/repo' };
let current = localProject;
jest.unstable_mockModule('../server/tools/helpers.js', () => ({
  resolveProjectForCall: async () => ({ project: current }),
  resolveLocalProjectRoot: async () => project,
  fetchGithub: async () => ({}),
  localApiUrl: (p) => p,
}));

const { projectFileReader, handleProjectWindowTool } = await import('../server/tools/handlers/projectWindow.js');
const { followFileInPreview } = await import('../server/collaboration/chatPreview.js');
const { OWNER_ONLY_FILE } = await import('../server/security/secretFiles.js');
const { PREVIEW_OFF_BOARD } = await import('../shared/files/fileProblems.js');
const { upsertWindowInDoc } = await import('../server/collab/serverWriter.js');
const { readDocWindows } = await import('../server/agent-registry/helpCards.js');

afterAll(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

const refusal = (promise) => promise.then(() => null, (err) => err.code);

test("the preview's reader reads an ordinary file and refuses one only the owner opens", async () => {
  const read = projectFileReader(localProject);
  expect(await read('notes.md')).toBe('# Made-up note');
  for (const rel of ['.env', '.made-up/page.html', 'made-up-link.md', 'made-up-outside.md']) {
    expect(await refusal(read(rel))).toBe(OWNER_ONLY_FILE);
  }
});

test("a GitHub project's file that holds keys is never asked of GitHub for the preview", async () => {
  const read = projectFileReader(githubProject, 'main');
  for (const rel of ['.env', '.env?x=.md', 'docs/../made-up.pem']) expect(await refusal(read(rel))).toBe(OWNER_ONLY_FILE);
  expect(ghGetFile).not.toHaveBeenCalled();
  expect(await read('notes.md')).toBe('Made-up words of notes.md');
});

test('a page in the preview leaves out what it would pull in from a file only the owner opens', async () => {
  const doc = new Y.Doc();
  upsertWindowInDoc(doc, { id: 'chat-1', kind: 'chat', agentId: 'made-up-agent', x: 100, y: 80, w: 420, h: 560 });
  const transact = async (_id, mutate) => { doc.transact(() => mutate(doc)); return true; };
  const shown = await followFileInPreview({
    workspaceId: 'made-up-board', chatWindowId: 'chat-1', agentId: 'made-up-agent', project: localProject,
    filePath: 'index.html', readFile: projectFileReader(localProject),
  }, { transact });
  expect(shown.status).toBe('opened');
  expect(shown.window.html).toContain('Made-up page');
  expect(shown.window.html).toContain('h1{font-weight:600}');
  expect(JSON.stringify(readDocWindows(doc))).not.toContain(KEY);
});

describe('show_file', () => {
  const show = (rel) => handleProjectWindowTool('made-up-agent', 'project_window', { action: 'show_file', path: rel }, { workspaceId: 'made-up-board', windowId: 'chat-1', userId: 1 });

  test('gives plain words for a file only the owner opens, and shows nothing', async () => {
    current = localProject;
    for (const rel of ['.made-up/page.html', 'made-up-link.md', 'made-up-outside.md']) {
      const said = await show(rel);
      expect(said).toBe(`Error: ${PREVIEW_OFF_BOARD}`);
    }
    current = githubProject;
    ghGetFile.mockClear();
    expect(await show('.env?x=.md')).toBe(`Error: ${PREVIEW_OFF_BOARD}`);
    expect(ghGetFile).not.toHaveBeenCalled();
  });
});
