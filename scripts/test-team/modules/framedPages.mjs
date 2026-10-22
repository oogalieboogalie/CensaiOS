// Windows that show an outside page in a frame: Browser, Stream Viewer, n8n
// and the Webview shell. Each saves its link on the shared board, so the red
// team plays a hostile teammate: Pat's browser writes a "javascript:" link
// into each window, and Sam's browser must not run it. The walk checks a
// plain web address still loads.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';

const WINDOWS = [
  { kind: 'browser', label: 'Browser', field: 'url' },
  { kind: 'stream', label: 'Stream Viewer', field: 'src' },
  { kind: 'n8n', label: 'n8n', field: 'url' },
  { kind: 'webviewShell', label: 'Webview', field: 'url' },
];

const frameSrcs = (page, id) => windowFrame(page, id).locator('iframe')
  .evaluateAll((list) => list.map((f) => f.getAttribute('src') || ''))
  .catch(() => []);

export default {
  id: 'framedPages',
  label: 'Windows that show outside pages',
  async run(t) {
    const { pat, sam, check } = t;
    let x = 20;
    for (const w of WINDOWS) {
      await check('walk', `a ${w.label} window with a plain web address loads it for Sam too`, async ({ shot }) => {
        const id = await spawnWindow(pat.page, w.kind, { [w.field]: 'https://example.com/' }, { x, y: 40 }, { w: 420, h: 320 });
        x += 30;
        await windowFrame(sam.page, id).waitFor({ state: 'visible', timeout: 10_000 });
        await sam.page.waitForTimeout(1500);
        const srcs = await frameSrcs(sam.page, id);
        await shot(sam.page, `sam-sees-${w.kind}-with-a-web-address`);
        if (!srcs.some((s) => s.startsWith('https://example.com'))) throw new Error(`Sam's frame did not load it (frames: ${JSON.stringify(srcs).slice(0, 100)})`);
        return 'the page loads in Sam\'s frame';
      });
      await check('redteam', `a teammate cannot plant a script in a ${w.label} window`, async () => {
        const flag = `__teamRan_${w.kind}`;
        const id = await spawnWindow(pat.page, w.kind, { [w.field]: `javascript:parent.${flag}=1` }, { x, y: 380 }, { w: 420, h: 320 });
        x += 30;
        await windowFrame(sam.page, id).waitFor({ state: 'visible', timeout: 10_000 });
        await sam.page.waitForTimeout(2500);
        const saved = await readWindow(sam.page, id);
        if (await sam.page.evaluate((f) => window[f] === 1, flag)) throw new Error(`the planted link ran as Sam (saved ${w.field}: ${String(saved?.[w.field]).slice(0, 40)})`);
        if ((await frameSrcs(sam.page, id)).some((s) => /^\s*javascript:/i.test(s))) throw new Error('the script link reached Sam\'s frame');
        return 'Sam\'s browser did not run it';
      });
    }
  },
};
