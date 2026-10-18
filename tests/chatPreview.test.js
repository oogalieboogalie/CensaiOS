// Chat live preview: an agent writes a file people can look at and one
// preview window opens beside its chat (linked with a line), then refreshes
// on every later write; css/js refresh the page that uses them; Run dev
// takes over for app folders; project_window points at windows.
import * as Y from 'yjs';
import { upsertWindowInDoc } from '../server/collab/serverWriter.js';
import { valueFromY } from '../server/collab/seedFromSnapshot.js';
import { CANVAS_ROOT } from '../server/collab/ySchema.js';
import { readDocWindows } from '../server/agent-registry/helpCards.js';
import {
  assetPath, chatPreviewPosition, filePreviewHtml, imageDataUrl, inlineLocalAssets, previewKindForPath,
} from '../server/collaboration/chatPreviewShape.js';
import { markdownToHtml } from '../server/collaboration/markdownPreview.js';
import { followFileInPreview, openRunDevBeside, pointAtWindow } from '../server/collaboration/chatPreview.js';
import { autoStartIsMine, freshPointsFor, pointedNow } from '../src/lib/chat/agentPointer.js';

const CHAT = { id: 'chat-1', kind: 'chat', agentId: 'atlas', x: 100, y: 80, w: 420, h: 560 };

function board(extra = []) {
  const doc = new Y.Doc();
  for (const win of [CHAT, ...extra]) upsertWindowInDoc(doc, win);
  const transact = async (_id, mutate) => { doc.transact(() => mutate(doc)); return true; };
  const links = () => (doc.getMap(CANVAS_ROOT).get('links')?.toArray() || []).map(valueFromY);
  return { doc, deps: { transact }, wins: () => readDocWindows(doc), links };
}

function files(map) {
  return async (rel) => {
    if (!(rel in map)) throw new Error(`ENOENT ${rel}`);
    return map[rel];
  };
}

const project = { name: 'sunny-bakery', path: '/projects/sunny-bakery' };

describe('what a written file shows as', () => {
  test('pages, pictures and notes show; css/js refresh a page; the rest does not', () => {
    expect(previewKindForPath('site/index.HTML')).toBe('html');
    expect(previewKindForPath('logo.svg')).toBe('svg');
    expect(previewKindForPath('README.md')).toBe('markdown');
    expect(previewKindForPath('hero.png')).toBe('image');
    expect(previewKindForPath('style.css')).toBe('asset');
    expect(previewKindForPath('server.py')).toBeNull();
  });

  test('markdown is escaped first, so a note cannot run script', () => {
    const html = markdownToHtml('# Menu\n\n- **Rye** loaf\n- <script>alert(1)</script>\n\n[x](javascript:alert(1))');
    expect(html).toContain('<h1>Menu</h1>');
    expect(html).toContain('<li><strong>Rye</strong> loaf</li>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="#"');
  });

  test('images written as base64 become data URLs; svg is centred on a page', () => {
    expect(imageDataUrl('a.png', 'iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(imageDataUrl('a.png', 'not an image!')).toBeNull();
    expect(filePreviewHtml('svg', 'logo.svg', '<svg></svg>')).toContain('<div class="stage"><svg></svg></div>');
  });

  test('a page keeps its own css and js inline, never files outside the project', async () => {
    const html = '<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="https://cdn.example/x.css"><script src="./app.js"></script>';
    const out = await inlineLocalAssets(html, 'site/index.html', files({ 'site/style.css': 'h1{color:red}', 'site/app.js': 'go()' }));
    expect(out.html).toContain('<style data-from="site/style.css">h1{color:red}</style>');
    expect(out.html).toContain('<script data-from="site/app.js">go()</script>');
    expect(out.html).toContain('https://cdn.example/x.css');
    expect(assetPath('index.html', '../../etc/passwd')).toBeNull();
  });

  test('the preview sits right of the chat and slides below anything in the way', () => {
    expect(chatPreviewPosition(CHAT, [CHAT])).toEqual({ x: 560, y: 80 });
    const blocker = { id: 'b', x: 560, y: 80, w: 300, h: 200 };
    expect(chatPreviewPosition(CHAT, [CHAT, blocker])).toEqual({ x: 560, y: 320 });
  });
});

describe('the chat live preview on the board', () => {
  test('first write opens one linked preview; later writes refresh the same window', async () => {
    const b = board();
    const site = { 'index.html': '<h1>Sunny Bakery</h1>' };
    const first = await followFileInPreview({ workspaceId: 'w', chatWindowId: 'chat-1', agentId: 'atlas', project, filePath: 'index.html', readFile: files(site) }, b.deps);
    expect(first.status).toBe('opened');
    site['index.html'] = '<h1>Sunny Bakery</h1><p>Fresh bread daily</p>';
    const second = await followFileInPreview({ workspaceId: 'w', chatWindowId: 'chat-1', agentId: 'atlas', project, filePath: 'index.html', readFile: files(site) }, b.deps);
    expect(second.status).toBe('refreshed');
    const previews = b.wins().filter((win) => win.kind === 'htmlPreview');
    expect(previews).toHaveLength(1);
    expect(previews[0]).toMatchObject({ chatId: 'chat-1', fileName: 'index.html', previewRevision: 2, x: 560, y: 80 });
    expect(previews[0].html).toContain('Fresh bread daily');
    expect(b.links()).toEqual([expect.objectContaining({ fromId: 'chat-1', toId: previews[0].id })]);
  });

  test('writing the stylesheet refreshes the page that uses it', async () => {
    const b = board();
    const site = { 'index.html': '<link rel="stylesheet" href="style.css"><h1>Hi</h1>', 'style.css': 'h1{color:blue}' };
    await followFileInPreview({ workspaceId: 'w', chatWindowId: 'chat-1', agentId: 'atlas', project, filePath: 'index.html', readFile: files(site) }, b.deps);
    site['style.css'] = 'h1{color:green}';
    const shown = await followFileInPreview({ workspaceId: 'w', chatWindowId: 'chat-1', agentId: 'atlas', project, filePath: 'style.css', readFile: files(site) }, b.deps);
    expect(shown.status).toBe('refreshed');
    expect(shown.window.html).toContain('h1{color:green}');
  });

  test('nothing to show (code file, no chat on the board) changes nothing', async () => {
    const b = board();
    expect(await followFileInPreview({ workspaceId: 'w', chatWindowId: 'chat-1', agentId: 'atlas', project, filePath: 'main.py', readFile: files({}) }, b.deps)).toBeNull();
    expect(await followFileInPreview({ workspaceId: 'w', chatWindowId: 'gone', agentId: 'atlas', project, filePath: 'a.html', readFile: files({ 'a.html': 'x' }) }, b.deps)).toBeNull();
    expect(b.wins()).toHaveLength(1);
  });

  test('an app with Run dev open reloads there: the chat is linked to it instead', async () => {
    const dev = { id: 'dev-1', kind: 'devServer', folder: '/projects/sunny-bakery/', x: 900, y: 80, w: 520, h: 420 };
    const b = board([dev]);
    const shown = await followFileInPreview({ workspaceId: 'w', chatWindowId: 'chat-1', agentId: 'atlas', project, filePath: 'src/App.html', readFile: files({ 'src/App.html': 'x' }) }, b.deps);
    expect(shown.status).toBe('dev');
    expect(b.wins().some((win) => win.kind === 'htmlPreview')).toBe(false);
    expect(b.links()).toEqual([expect.objectContaining({ fromId: 'chat-1', toId: 'dev-1' })]);
  });

  test('point makes a window glow for the person who asked and links it', async () => {
    const b = board([{ id: 'sheet-1', kind: 'officeSheets', title: 'Budget sheet', x: 1200, y: 600, w: 400, h: 300 }]);
    const win = await pointAtWindow('w', { chatWindowId: 'chat-1', windowId: 'sheet-1', agentId: 'atlas', userId: 7, note: 'totals here' }, b.deps);
    expect(win.pointedAt).toMatchObject({ by: 'atlas', forUserId: '7', note: 'totals here' });
    expect(pointedNow(win)).toBe('true');
    expect(freshPointsFor(b.wins(), '7', new Set())).toHaveLength(1);
    expect(freshPointsFor(b.wins(), '8', new Set())).toHaveLength(0);
    expect(b.links()).toHaveLength(1);
    expect(await pointAtWindow('w', { windowId: 'missing' }, b.deps)).toBeNull();
    const byTitle = await pointAtWindow('w', { title: 'budget', agentId: 'atlas', userId: 7 }, b.deps);
    expect(byTitle.id).toBe('sheet-1');
  });

  test('run_app opens Run dev beside the chat once, starting only for the asker', async () => {
    const b = board();
    const first = await openRunDevBeside('w', { chatWindowId: 'chat-1', agentId: 'atlas', userId: 7, folder: project.path, title: 'Run dev' }, b.deps);
    expect(first.created).toBe(true);
    expect(first.window).toMatchObject({ kind: 'devServer', folder: project.path, autoStart: true, autoStartFor: '7', x: 560 });
    expect(autoStartIsMine(first.window, '7')).toBe(true);
    expect(autoStartIsMine(first.window, '8')).toBe(false);
    const again = await openRunDevBeside('w', { chatWindowId: 'chat-1', agentId: 'atlas', userId: 7, folder: project.path }, b.deps);
    expect(again.created).toBe(false);
    expect(b.wins().filter((win) => win.kind === 'devServer')).toHaveLength(1);
  });
});

describe('several writes in one chat turn', () => {
  test('a short run of project writes keeps going; loops and long runs are wrapped up', async () => {
    const { shouldSynthesizeAfterToolBatch, MAX_PROJECT_WRITES_PER_TURN } = await import('../server/routes/chat/prompts.js');
    const write = (path, content, ok = true) => ({ tool: 'project_write', args: { path, content }, ok });
    expect(shouldSynthesizeAfterToolBatch([write('index.html', 'a'), write('style.css', 'b')], 2)).toBe(false);
    expect(shouldSynthesizeAfterToolBatch([write('index.html', 'a'), write('index.html', 'a')], 2)).toBe(true);
    expect(shouldSynthesizeAfterToolBatch([write('index.html', 'a', false)], 1)).toBe(true);
    expect(shouldSynthesizeAfterToolBatch(Array.from({ length: MAX_PROJECT_WRITES_PER_TURN }, (_, i) => write(`p${i}.html`, 'x')), 4)).toBe(true);
    expect(shouldSynthesizeAfterToolBatch([{ tool: 'report', args: {} }], 1)).toBe(true);
  });
});
