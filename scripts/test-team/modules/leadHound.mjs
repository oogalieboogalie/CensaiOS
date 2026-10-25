// LeadHound: Pat saves a made-up Tavily key, fills the brief, gets leads,
// opens the strongest one (7-day sequence and ice breaker) and downloads the
// leads; Sam, with no Tavily key of their own, gets the plain "add your key"
// message and never Pat's key. Then the wrong things: an empty brief, a huge
// brief, Tavily refusing the key. Red team: signed out, junk briefs.
// Searches go to a stand-in Tavily that only knows made-up businesses, and
// the stand-in model answers LeadHound's prompts.

import fs from 'node:fs';
import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { STANDIN_BRIEF } from '../../../tests/fixtures/leadHoundStandin.js';

const PAT_KEY = 'tvly-made-up-pat-key';
const RAW = /\bat [\w.]+ \(|node_modules|ECONN|SELECT |INSERT |tvly-/;

async function openLeadHound(page, at) {
  const id = await spawnWindow(page, 'leadHound', {}, at, { w: 1000, h: 720 });
  await windowFrame(page, id).getByText('Who should you be talking to?').waitFor({ timeout: 15_000 });
  return id;
}

async function fillBrief(frame, brief) {
  await frame.getByPlaceholder(/AI receptionists for dental clinics/).fill(brief.business);
  await frame.getByPlaceholder(/Independent dental practices/).fill(brief.market);
  await frame.getByLabel('Region').fill(brief.region || '');
}

export default {
  id: 'leadHound',
  label: 'LeadHound (leads and outreach)',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_KEY, STANDIN_BRIEF.business, STANDIN_BRIEF.market);
    let id;
    let frame;

    await check('walk', 'Pat opens LeadHound and saves a Tavily key', async ({ shot }) => {
      id = await openLeadHound(pat.page, { x: 40, y: 40 });
      frame = windowFrame(pat.page, id);
      await shot(pat.page, 'pat-opens-leadhound');
      await frame.getByLabel('Tavily API key').fill(PAT_KEY);
      await frame.getByRole('button', { name: 'Save key' }).click();
      await frame.getByRole('button', { name: 'Change Tavily key' }).waitFor({ timeout: 10_000 });
      const status = await t.api(pat, 'GET', '/api/leadhound/status');
      if (status.body?.tavily?.source !== 'byok') throw new Error(`LeadHound does not see Pat's key (${status.text.slice(0, 80)})`);
      return 'the key was saved in Pat\'s own key vault';
    });

    await check('walk', 'Pat fills the brief and gets ranked leads', async ({ shot }) => {
      await fillBrief(frame, STANDIN_BRIEF);
      await shot(pat.page, 'pat-fills-the-brief');
      await frame.getByRole('button', { name: 'Find leads' }).click();
      await frame.locator('.hb-lh-results').waitFor({ timeout: 60_000 });
      const names = await frame.locator('.hb-lh-lead-name').allInnerTexts();
      await shot(pat.page, 'pat-gets-leads');
      if (names.length < 3) throw new Error(`only ${names.length} leads came back: ${names.join(', ')}`);
      const note = frame.locator('.hb-lh-note');
      const warning = (await note.count()) ? await note.innerText() : '';
      if (warning) throw new Error(`the hunt warned: ${warning.slice(0, 160)}`);
      return `${names.length} leads, strongest first: ${names.join(', ')}`;
    });

    await check('walk', 'Pat opens the strongest lead and sees the 7-day sequence and the ice breaker', async ({ shot }) => {
      await frame.locator('.hb-lh-lead').first().click();
      const days = await frame.locator('.hb-lh-touch').count();
      await shot(pat.page, 'pat-sees-the-7-day-sequence');
      if (days !== 7) throw new Error(`the sequence has ${days} days, not 7`);
      await frame.getByRole('button', { name: 'Ice breaker', exact: true }).click();
      const deliverable = await frame.locator('.hb-lh-ice .hb-lh-deliverable').innerText().catch(() => '');
      const title = await frame.getByLabel('Ice breaker title').inputValue().catch(() => '');
      await shot(pat.page, 'pat-sees-the-ice-breaker');
      if (!deliverable.trim()) throw new Error('the ice breaker is empty');
      return `7 days of outreach and the ice breaker "${title}"`;
    });

    await check('walk', 'Pat downloads the leads as a spreadsheet file', async () => {
      const [download] = await Promise.all([
        pat.page.waitForEvent('download', { timeout: 10_000 }),
        frame.getByRole('button', { name: 'Download CSV' }).click(),
      ]);
      const text = fs.readFileSync(await download.path(), 'utf8');
      const rows = text.trim().split('\n').length - 1;
      if (!/Barton Creek Family Dental/.test(text)) throw new Error('the file does not hold the strongest lead');
      return `${download.suggestedFilename()}: ${rows} rows`;
    });

    await check('walk', 'Sam, with no Tavily key, is told to add one and never uses Pat\'s', async ({ shot }) => {
      const before = t.tavily.calls.length;
      const status = await t.api(sam, 'GET', '/api/leadhound/status');
      if (status.body?.tavily?.configured) throw new Error(`Sam's LeadHound says a key is set up (${status.body.tavily.source})`);
      const samId = await openLeadHound(sam.page, { x: 1100, y: 40 });
      // Sam's own window sits right of Pat's; Sam scrolls the board to it.
      await sam.page.evaluate(() => window.__e2eStore.getState().setPan({ x: -1060, y: 0 }));
      const samFrame = windowFrame(sam.page, samId);
      await samFrame.getByLabel('Tavily API key').waitFor({ timeout: 10_000 });
      await fillBrief(samFrame, STANDIN_BRIEF);
      await samFrame.getByRole('button', { name: 'Find leads' }).click();
      const alert = samFrame.getByRole('alert');
      await alert.waitFor({ timeout: 20_000 });
      const said = await alert.innerText();
      await shot(sam.page, 'sam-is-asked-for-a-key');
      if (t.tavily.calls.length !== before) throw new Error('Sam\'s hunt reached Tavily with someone else\'s key');
      if (!/Tavily API key/.test(said)) throw new Error(`Sam saw "${said.slice(0, 120)}"`);
      return `Sam saw: ${said.slice(0, 100)}`;
    });

    await check('hunt', 'an empty brief cannot be sent', async () => {
      const button = frame.getByRole('button', { name: 'New hunt' });
      if (await button.count()) await button.click();
      await fillBrief(frame, { business: '', market: '', region: '' });
      if (await frame.getByRole('button', { name: 'Find leads' }).isEnabled()) throw new Error('Find leads is clickable with an empty brief');
      const res = await t.api(pat, 'POST', '/api/leadhound/run', { business: '  ', market: '' });
      if (res.status !== 400) throw new Error(`the server answered ${res.status} to an empty brief`);
      return `button off; the server says: ${res.body?.error}`;
    });

    await check('hunt', 'a huge brief (20,000 letters) gets leads or a plain refusal', async () => {
      const huge = `Made-up long brief ${'receptionist '.repeat(1600)}`.slice(0, 20_000);
      t.typed.push(huge);
      const res = await t.api(pat, 'POST', '/api/leadhound/run', { business: huge, market: STANDIN_BRIEF.market, maxLeads: 1 });
      if (RAW.test(res.text)) throw new Error(`answered ${res.status} with raw server text`);
      if (res.status >= 500) throw new Error(`the server failed with ${res.status}: ${res.body?.error}`);
      return res.status === 200 ? `${res.body?.leads?.length} lead; the brief was cut to ${res.body?.brief?.business?.length} letters` : `refused: ${res.body?.error}`;
    });

    await check('hunt', 'Tavily refusing the key gives a plain message', async ({ shot }) => {
      await t.api(pat, 'POST', '/api/keys', { provider: 'tavily', apiKey: 'made-up-wrong-key' });
      try {
        await fillBrief(frame, STANDIN_BRIEF);
        await frame.getByRole('button', { name: 'Find leads' }).click();
        const alert = frame.getByRole('alert').first();
        await alert.waitFor({ timeout: 30_000 });
        const said = await alert.innerText();
        await shot(pat.page, 'pat-sees-tavily-refuse-the-key');
        if (!/Tavily did not accept that API key/.test(said)) throw new Error(`Pat saw "${said.slice(0, 120)}"`);
        return `Pat saw: ${said.slice(0, 100)}`;
      } finally {
        await t.api(pat, 'POST', '/api/keys', { provider: 'tavily', apiKey: PAT_KEY });
      }
    });

    await check('redteam', 'signed out, LeadHound answers nothing', async () => {
      const before = t.tavily.calls.length;
      const status = await t.api({ ctx: t.signedOut }, 'GET', '/api/leadhound/status');
      const run = await t.api({ ctx: t.signedOut }, 'POST', '/api/leadhound/run', STANDIN_BRIEF);
      if (run.status < 400 || t.tavily.calls.length !== before) throw new Error(`a hunt ran with no sign-in (${run.status})`);
      if (status.body?.tavily?.configured) throw new Error('the status told a signed-out visitor a key is set up');
      return `status ${status.status}, hunt ${run.status}`;
    });

    await check('redteam', 'junk briefs give a plain answer, not raw errors', async () => {
      const junk = [{ business: { a: 1 }, market: ['x'] }, { business: 'x', market: 'y', maxLeads: 'all' }, { business: 'x', market: 'y', region: '<script>' }];
      const answers = [];
      for (const body of junk) {
        const res = await t.api(pat, 'POST', '/api/leadhound/run', body);
        if (RAW.test(res.text)) throw new Error(`answered ${res.status} with raw server text: ${res.text.slice(0, 80)}`);
        answers.push(res.status);
      }
      if (answers.some((s) => s >= 500)) throw new Error(`a junk brief broke the server: ${answers.join(', ')}`);
      if (answers[0] !== 400) throw new Error(`a brief made of a list and an object ran a hunt (${answers[0]}) instead of being refused`);
      return `answered ${answers.join(', ')}`;
    });
  },
};
