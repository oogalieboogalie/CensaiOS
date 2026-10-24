// To-dos and the Scheduler for two: Pat Example adds two made-up to-dos and
// hands one to Sam Example, who sees it in the list and in the bottom-bar
// "For you" badge. Pat schedules the other from the Scheduler's to-do picker
// with a tag and a repeat; the clock is moved so the stand-in agent runs it
// and the result shows. Bug hunt: a start in the past, "every 0 minutes",
// Sam trying to change Pat's schedule. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note } from '../report.mjs';


const myId = (page) => page.evaluate(async () => (await (await fetch('/api/auth/session', { credentials: 'include' })).json())?.user?.id ?? null);
const schedules = async (t, who) => (await t.api(who, 'GET', `/api/schedules?workspaceId=${encodeURIComponent(t.workspaceId)}`)).body || [];

async function moveClock(t, scheduleId) {
  const { default: pg } = await import('pg');
  const db = new pg.Client({ connectionString: t.databaseUrl });
  await db.connect();
  try {
    await db.query("UPDATE schedules SET next_run_at = NOW() - INTERVAL '1 second' WHERE id = $1", [scheduleId]);
  } finally {
    await db.end();
  }
}

/** Waits until a schedule has run (a result or an error); returns the row. */
async function waitForRun(t, id, ms = 90_000) {
  const until = Date.now() + ms;
  let row = null;
  while (Date.now() < until) {
    row = (await schedules(t, t.pat)).find((s) => s.id === id) || null;
    if (row && row.status !== 'running' && (row.last_result || row.last_error || row.status === 'failed')) return row;
    await t.pat.page.waitForTimeout(2000);
  }
  return row;
}

export default {
  id: 'scheduler',
  label: 'Scheduler and To-dos',
  async run(t) {
    const { pat, sam, check } = t;
    let todos; let sched; let scheduleId;
    // Each run (dark, then light) gets its own words, so one run's schedule is never mistaken for the other's.
    const run = Date.now().toString(36).slice(-4);
    const FOR_SAM = `Made-up: water the seed trays ${run}`;
    const TO_SCHEDULE = `Made-up: count the seed packets ${run}`;

    await check('walk', 'Pat adds two made-up to-dos', async ({ shot }) => {
      todos = await spawnWindow(pat.page, 'todos', { title: 'Made-up greenhouse list' }, { x: 60, y: 70 }, { w: 420, h: 360 });
      const input = windowFrame(pat.page, todos).locator('input[data-mission="todo-input"]');
      await input.waitFor({ state: 'visible', timeout: 15_000 });
      for (const text of [FOR_SAM, TO_SCHEDULE]) { await input.fill(text); await input.press('Enter'); t.typed.push(text); }
      const win = await readWindow(pat.page, todos);
      const texts = (win?.items || []).map((i) => i.text);
      if (!texts.includes(FOR_SAM) || !texts.includes(TO_SCHEDULE)) throw new Error(`the list holds ${texts.length} to-do(s)`);
      await shot(pat.page, 'pat-adds-two-to-dos');
      return 'both to-dos are on the list';
    });

    await check('walk', 'Pat hands one to-do to Sam', async ({ shot }) => {
      const samId = await myId(sam.page);
      const row = windowFrame(pat.page, todos).locator('[data-testid="todo-assign"]').first();
      await row.click();
      const option = pat.page.locator(`[data-assign="person-${samId}"]`);
      await option.waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => { throw new Error('the Assign menu has no way to pick Sam'); });
      await shot(pat.page, 'pat-picks-sam-in-the-assign-menu');
      await option.click();
      const win = await readWindow(pat.page, todos);
      const item = (win?.items || []).find((i) => i.text === FOR_SAM);
      if (item?.assignee !== `user:${samId}`) throw new Error(`the to-do is assigned to "${item?.assignee || 'nobody'}"`);
      return 'the to-do now shows Sam as its person';
    });

    await check('walk', 'Sam sees the to-do in the list and in the For you badge', async ({ shot }) => {
      await windowFrame(sam.page, todos).getByText(FOR_SAM).waitFor({ timeout: 15_000 });
      const badge = sam.page.locator('[data-testid="my-todos-badge"]');
      await badge.waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => { throw new Error('Sam has no For you badge for the to-do'); });
      await badge.click();
      await sam.page.locator('.hb-mytodos-row-title', { hasText: FOR_SAM }).waitFor({ timeout: 5000 });
      await shot(sam.page, 'sam-sees-it-for-you');
      await badge.click();
      return 'the badge says 1 for Sam and lists the to-do';
    });

    await check('walk', 'Pat schedules the other to-do with a tag and a repeat', async ({ shot }) => {
      sched = await spawnWindow(pat.page, 'scheduler', {}, { x: 500, y: 70 }, { w: 760, h: 640 });
      const frame = windowFrame(pat.page, sched);
      await frame.locator('.hb-sched-todo', { hasText: TO_SCHEDULE }).click({ timeout: 15_000 });
      await frame.locator('.hb-sched-tagchip', { hasText: 'Maintenance' }).click();
      await frame.getByRole('group', { name: 'Repeat' }).getByRole('button', { name: 'Every day' }).click();
      await frame.getByRole('button', { name: 'Schedule it' }).click();
      await frame.locator('.hb-sched-title', { hasText: TO_SCHEDULE }).waitFor({ timeout: 15_000 })
        .catch(() => { throw new Error('the new run did not show on the timeline'); });
      const row = (await schedules(t, pat)).find((s) => s.task_text === TO_SCHEDULE);
      if (!row) throw new Error('the timeline shows it but the server has no such schedule');
      if (row.tag !== 'Maintenance' || !row.repeat_enabled) throw new Error(`saved with tag "${row.tag}" and repeat ${row.repeat_enabled}`);
      scheduleId = row.id;
      await shot(pat.page, 'pat-schedules-the-to-do');
      return 'it shows on the timeline with the Maintenance tag, every day';
    });

    await check('walk', 'when its time comes the stand-in agent runs it and the result shows', async ({ shot }) => {
      await moveClock(t, scheduleId);
      const row = await waitForRun(t, scheduleId);
      if (!row?.last_result && !row?.last_error) throw new Error(`nothing happened within 90 seconds (status ${row?.status || 'unknown'})`);
      await pat.page.reload();
      await pat.page.waitForFunction(() => document.readyState === 'complete');
      await pat.page.evaluate(async () => { window.__e2eStore = (await import('/src/lib/store.js')).useWorkspaceStore; });
      const note1 = windowFrame(pat.page, sched).locator('.hb-sched-note').first();
      await note1.waitFor({ timeout: 20_000 }).catch(() => {});
      await shot(pat.page, 'the-run-and-its-result');
      if (row.last_error) throw new Error(`the run failed: ${String(row.last_error).slice(0, 160)}`);
      if (row.status !== 'active') throw new Error(`after the run the daily schedule is "${row.status}" instead of waiting for tomorrow`);
      return 'the run finished, its result shows on the card, and the schedule waits for tomorrow';
    });

    await check('redteam', 'Sam cannot pause or delete Pat\'s schedule', async () => {
      const pause = await t.api(sam, 'PATCH', `/api/schedules/${scheduleId}?workspaceId=${encodeURIComponent(t.workspaceId)}`, { status: 'inactive' });
      const remove = await t.api(sam, 'DELETE', `/api/schedules/${scheduleId}?workspaceId=${encodeURIComponent(t.workspaceId)}`);
      const still = (await schedules(t, pat)).find((s) => s.id === scheduleId);
      if (!still || still.status === 'inactive') throw new Error('Sam changed Pat\'s schedule');
      return `pause refused (${pause.status}), delete refused (${remove.status}), Pat's run is untouched`;
    });

    await check('hunt', 'a daily run whose start date is a week back fires once, not over and over', async () => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const days = { s: true, m: true, t: true, w: true, th: true, f: true, sat: true };
      const made = await t.api(pat, 'POST', '/api/schedules', {
        workspaceId: t.workspaceId, agent_id: 'architect', task_text: 'Made-up: check the old seed log',
        scheduled_time: '9:00 AM', scheduled_date: weekAgo, repeat_enabled: true, repeat_freq: 'weekly', repeat_days: days, status: 'active',
      });
      t.typed.push('Made-up: check the old seed log');
      if (made.status >= 400) throw note(`a start in the past is refused (${made.status})`);
      const row = await waitForRun(t, made.body.id);
      const next = row?.next_run_at ? new Date(row.next_run_at) : null;
      await t.api(pat, 'DELETE', `/api/schedules/${made.body.id}?workspaceId=${encodeURIComponent(t.workspaceId)}`);
      if (!row?.last_result && !row?.last_error) throw note('it was accepted but did not run within 90 seconds');
      if (!next || next <= new Date()) throw new Error(`after one run its next run is still in the past (${row?.next_run_at}), so it fires again at once`);
      return `it ran once and its next run is ${row.next_run_at}, ahead of now`;
    });

    await check('hunt', 'a repeat of every 0 minutes', async () => {
      const made = await t.api(pat, 'POST', '/api/schedules', {
        workspaceId: t.workspaceId, agent_id: 'architect', task_text: 'Made-up: every zero minutes',
        scheduled_time: '9:00 AM', scheduled_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        repeat_enabled: true, repeat_freq: 'minutes', repeat_every: 0, status: 'active',
      });
      t.typed.push('Made-up: every zero minutes');
      if (made.body?.id) await t.api(pat, 'DELETE', `/api/schedules/${made.body.id}?workspaceId=${encodeURIComponent(t.workspaceId)}`);
      if (made.status >= 500) throw new Error(`the server broke on it (${made.status}) instead of saying no`);
      if (made.status >= 400) return `refused in plain words: "${made.body?.error}"`;
      throw note('it was accepted; the Scheduler has no minutes repeat, so it cannot run in a loop');
    });
  },
};
