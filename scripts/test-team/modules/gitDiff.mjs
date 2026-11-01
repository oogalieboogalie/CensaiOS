// Git Diff Viewer for two people. Pat Example pastes a made-up old and new
// version and compares them; Sam Example sees the same diff on their own
// screen. A script tag pasted in shows as words. Red team: Sam calls the git
// routes directly (save a version, send to GitHub, start versions, a new
// project, start, stop or remove a coding agent's task) and each is refused
// as owner-only; the refusal log lines carry no file path. The cloud runner
// has no coding CLIs, so the "Agent:" side of the viewer is not walked here.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note } from '../report.mjs';

const BEFORE = 'Made-up recipe\nflour 2 cups\nsugar 1 cup\nbake 20 minutes';
const AFTER = 'Made-up recipe\nflour 3 cups\nsugar 1 cup\nbake 25 minutes\n<script>window.__madeUpPwned = 165</script> made-up script line';
const REPO = '/tmp/made-up-repo-165';

async function diffText(page, id, words, ms = 15_000) {
  const frame = windowFrame(page, id);
  const until = Date.now() + ms;
  let text = '';
  while (Date.now() < until) {
    text = await frame.innerText().catch(() => '');
    if (words.every((w) => text.includes(w))) return text;
    await page.waitForTimeout(300);
  }
  return text;
}

export default {
  id: 'gitDiff',
  label: 'Git Diff Viewer: two people, owner-only git',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(BEFORE, AFTER);
    let win;

    await check('walk', 'Pat pastes two made-up versions and Sam sees the same diff', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'gitDiff', {}, { x: 60, y: 60 }, { w: 1000, h: 640 });
      const frame = windowFrame(pat.page, win);
      // Typed letter by letter, as a person would; the editor must stay open until Compare.
      await frame.getByTestId('gdv-before').pressSequentially(BEFORE.slice(0, 14), { delay: 5 });
      await frame.getByTestId('gdv-before').fill(BEFORE, { timeout: 10_000 });
      await frame.getByTestId('gdv-after').fill(AFTER, { timeout: 10_000 });
      await frame.getByTestId('gdv-compare').click();
      const want = ['flour 3 cups', 'bake 25 minutes', 'flour 2 cups'];
      const [patSaw, samSaw] = await Promise.all([diffText(pat.page, win, want), diffText(sam.page, win, want)]);
      await shot(sam.page, 'sam-sees-the-diff');
      const missing = want.filter((w) => !samSaw.includes(w));
      if (missing.length) throw new Error(`Sam's screen is missing ${missing.map((w) => `"${w}"`).join(', ')}`);
      const totals = (s) => (s.match(/\+\d+\s*−\d+/) || [''])[0];
      if (totals(patSaw) !== totals(samSaw)) throw new Error(`the counts differ: Pat ${totals(patSaw)}, Sam ${totals(samSaw)}`);
      return `both screens show the change with the same count (${totals(samSaw) || 'no count'})`;
    });

    await check('redteam', 'a script tag in the pasted text shows as words and runs nowhere', async ({ shot }) => {
      if (!win) throw note('the window never opened');
      const text = await diffText(sam.page, win, ['made-up script line']);
      await shot(pat.page, 'pat-sees-the-script-as-words');
      const problems = [];
      for (const [who, page] of [['Pat', pat.page], ['Sam', sam.page]]) {
        if (await page.evaluate(() => window.__madeUpPwned)) problems.push(`the script ran on ${who}'s screen`);
      }
      if (!text.includes('<script>')) problems.push('Sam does not see the script tag as words');
      if (problems.length) throw new Error(problems.join('; '));
      return 'both screens show the tag as plain words; nothing ran';
    });

    await check('redteam', 'Sam calls the git and coding-agent routes directly and each is refused', async () => {
      const tries = [
        ['POST', '/api/project-git/save', { path: REPO, message: 'Made-up save' }],
        ['POST', '/api/project-git/send', { path: REPO, title: 'Made-up change' }],
        ['POST', '/api/project-git/start', { path: REPO }],
        ['POST', '/api/project-git/new', { name: 'made-up-project-165' }],
        ['POST', '/api/cli-agents/tasks', { cli: 'claude', folder: REPO, prompt: 'Made-up ask' }],
        ['POST', '/api/cli-agents/tasks/made-up-task/stop'],
        ['DELETE', '/api/cli-agents/tasks/made-up-task'],
      ];
      const answers = [];
      for (const [method, url, data] of tries) {
        const res = await t.api(sam, method, url, data);
        answers.push({ what: `${method} ${url.replace('/api/', '')}`, status: res.status, ownerOnly: res.body?.reason === 'owner-only' });
      }
      const open = answers.filter((a) => !(a.status === 403 && a.ownerOnly));
      const pats = await t.api(pat, 'POST', '/api/project-git/save', { path: REPO, message: 'Made-up save' });
      const said = answers.map((a) => `${a.what} ${a.status}`).join(', ');
      if (open.length) throw new Error(`not refused as owner-only: ${open.map((a) => `${a.what} ${a.status}`).join(', ')}`);
      if (pats.body?.reason === 'owner-only') throw new Error('Pat, the owner, was refused as a teammate too');
      return `all refused as owner-only (${said}); Pat's own save got past the owner check (${pats.status}: no project there)`;
    });

    await check('redteam', 'the refusal log lines carry no file path or name', async () => {
      const lines = t.serverLog().split('\n').filter((line) => line.includes('refused') && /project-git|cli-agents/.test(line));
      if (!lines.length) throw note('no refusal lines for the git routes in the server log');
      const bad = lines.filter((line) => line.includes(REPO) || line.includes('made-up') || /Example|example\.com/.test(line));
      if (bad.length) throw new Error(`${bad.length} refusal lines carry a path or a name`);
      return `${lines.length} refusal lines like "${lines[0].replace(/^.*?refused/, 'refused')}"; no path, no name`;
    });
  },
};
