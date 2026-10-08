import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { buildModuleDocument, moduleCsp } from '../src/lib/modules/moduleDocument.js';
import { loadModuleExamples, readModuleDir } from '../server/modules/examples.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKENS = { '--surface': 'white', '--ink': 'black', '--accent': 'blue', '--font-sans': 'sans-serif' };

// Run a module's document the way the sandbox does: scripts on, the SDK
// injected, and a fake host on the other side of postMessage.
function runModule(source, { storage = {} } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => {
    if (/Not implemented: (HTMLCanvasElement|window\.print)/.test(err.message)) return;
    errors.push(err.message);
  });
  virtualConsole.on('error', (msg) => errors.push(String(msg)));
  const dom = new JSDOM(buildModuleDocument(source, { tokens: TOKENS, storage }), {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
  });
  const sent = [];
  dom.window.parent.postMessage = (msg) => sent.push(msg);
  dom.window.requestAnimationFrame = () => 0;
  return { dom, window: dom.window, document: dom.window.document, errors, sent };
}

function host(win, message) {
  win.dispatchEvent(new win.MessageEvent('message', { data: { __hbHost: 1, ...message }, source: win.parent }));
}

const modules = [
  ...await loadModuleExamples(),
  ...await readModuleDir(path.join(here, 'fixtures/modules')),
];

describe('the ten test-prompt modules run in the sandbox', () => {
  test.each(modules.map(m => [m.id, m]))('%s renders without script errors', (_id, mod) => {
    const { document, errors } = runModule(mod.source);
    expect(errors).toEqual([]);
    const visible = [...document.body.children].filter(el => el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE');
    expect(visible.map(el => el.textContent).join('').trim().length).toBeGreaterThan(10);
  });
});

describe('Module SDK', () => {
  test('storage.set reaches the host and remote changes reach onChange', () => {
    const { window, document, sent } = runModule(modules.find(m => m.id === 'tip-calculator').source);
    const bill = document.getElementById('bill');
    bill.value = '100';
    bill.dispatchEvent(new window.Event('input'));
    const set = sent.find(m => m.method === 'storage.set');
    expect(set).toMatchObject({ __hbModule: 1, args: { key: 'tip', value: { bill: '100', pct: 18, people: 4 } } });
    expect(document.getElementById('each-out').textContent).toBe('$29.50');

    // Another person on the board changes the crew size.
    host(window, { type: 'storage', data: { tip: { bill: '100', pct: 20, people: 2 } } });
    expect(document.getElementById('each-out').textContent).toBe('$60.00');
  });

  test('saved data is there before the module script runs', () => {
    const { document } = runModule(modules.find(m => m.id === 'listing-pipeline').source, {
      storage: { listings: [{ id: 'z', address: '1 Saved St', price: 1, stage: 'Closed' }] },
    });
    const board = document.getElementById('board').textContent;
    expect(board).toContain('1 Saved St');
    expect(board).not.toContain('14 Alder Way');
  });

  test('agent.ask resolves with the host answer and rejects with its error', async () => {
    const { window } = runModule('<p>x</p>');
    const asked = window.censai.agent.ask('hello');
    host(window, { id: 1, result: 'hi there' });
    await expect(asked).resolves.toBe('hi there');
    const denied = window.censai.agent.ask('again');
    host(window, { id: 2, error: 'Agent access was declined for this module.' });
    await expect(denied).rejects.toThrow('declined');
  });

  test('messages from anyone but the host are ignored', () => {
    const { window } = runModule('<p>x</p>', { storage: { a: 1 } });
    window.dispatchEvent(new window.MessageEvent('message', { data: { __hbHost: 1, type: 'storage', data: { a: 2 } }, source: null }));
    expect(window.censai.storage.get('a')).toBe(1);
  });

  test('theme changes restyle a running module', () => {
    const { window } = runModule('<p>x</p>');
    host(window, { type: 'theme', tokens: { '--accent': 'red' } });
    expect(window.document.documentElement.style.getPropertyValue('--accent')).toBe('red');
    expect(window.censai.theme.get('accent')).toBe('red');
  });

  test('the sandbox policy blocks the network unless granted', () => {
    expect(moduleCsp()).toContain("connect-src 'none'");
    expect(moduleCsp()).toContain("default-src 'none'");
    expect(moduleCsp({ network: true })).toContain('connect-src https:');
    expect(buildModuleDocument('<p>x</p>')).toContain('Content-Security-Policy');
    // Stored data can't close the init script.
    expect(buildModuleDocument('', { storage: { k: '</script><script>alert(1)</script>' } })).not.toContain('</script><script>alert');
  });
});
