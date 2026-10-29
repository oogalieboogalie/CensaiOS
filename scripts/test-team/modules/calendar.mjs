// The Calendar shows the month even without Google. Pat Example opens
// Calendar from the Add menu and finds this month's dates (today marked),
// "Add event", and Connect Google Calendar as an option that says plainly why
// it cannot connect here. Pat adds a made-up event on the 20th and it shows on
// that date, after a reload, and in a brand-new Calendar window: it is Pat's
// own calendar, not the window's. Sam Example, on the same board, sees the
// Calendar but not Pat's event, and Sam's own event stays off Pat's screen.
// Opening the 20th lists the event with its time and offers "Add event on
// this day". Bug hunt: an event that ends before it starts is refused in plain
// words, on screen and by the server; Sam cannot delete Pat's event; Delete
// asks first, and a deleted event stays gone after a reload. All made up.

import { openBoard, windowFrame } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';

/** "YYYY-MM-DD" for a day of this month, on the browser's clock. */
const dayOfMonth = (page, n) => page.evaluate((d) => {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), d);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}, n);
const isoAt = (page, day, hhmm) => page.evaluate(([d, t]) => new Date(`${d}T${t}:00`).toISOString(), [day, hhmm]);

const cell = (page, id, day) => windowFrame(page, id).locator(`[data-day="${day}"]`);
const onDay = (page, id, day, title, timeout = 10_000) => cell(page, id, day).getByText(title, { exact: true })
  .waitFor({ timeout }).then(() => true, () => false);

/** My events this month, as the server has them. */
async function myEvents(t, who, page) {
  const range = await page.evaluate(() => {
    const now = new Date();
    return [new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(), new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString()];
  });
  const res = await t.api(who, 'GET', `/api/my-calendar/events?start=${encodeURIComponent(range[0])}&end=${encodeURIComponent(range[1])}`);
  return { status: res.status, events: res.body?.events || [] };
}

async function closeCalendars(page) {
  const ids = await page.evaluate(() => window.__e2eStore.getState().wins.filter((w) => w.kind === 'calendar').map((w) => w.id));
  for (const id of ids) {
    await windowFrame(page, id).locator('[data-window-control="close"]').click({ timeout: 5_000 });
    await windowFrame(page, id).waitFor({ state: 'detached', timeout: 5_000 });
  }
}

/** Fills the New event form: a name, a day, and whole-hour start and end times. */
async function fillEvent(frame, { title, day, from, to }) {
  await frame.getByLabel('Event title').fill(title);
  if (day) await frame.locator('input[type="date"]').fill(day);
  for (const [which, [hour, half]] of [['Starts', from], ['Ends', to]]) {
    const group = frame.getByRole('group', { name: which });
    await group.getByLabel('Hour').selectOption(String(hour));
    await group.getByRole('button', { name: half }).click();
  }
}

export default {
  id: 'calendar',
  label: 'Calendar shows the month without Google',
  async run(t) {
    const { pat, sam, check } = t;
    // Each run (dark, then light) gets its own words, so one run's events are never mistaken for the other's.
    const run = Date.now().toString(36).slice(-4);
    const PATS = `Made-up dentist ${run}`;
    const SAMS = `Made-up haircut ${run}`;
    t.typed.push(PATS, SAMS);
    let id = null;
    let day20 = null;
    let patEvent = null;

    await check('walk', 'Pat opens Calendar from the Add menu: this month\'s dates show with today marked, "Add event" is there, and Connect Google Calendar says plainly why it cannot connect here', async ({ shot }) => {
      await closeCalendars(pat.page);
      const opened = await addFromMenu(pat.page, 'Calendar');
      if (opened.kind !== 'calendar') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}, not Calendar`);
      id = opened.id;
      day20 = await dayOfMonth(pat.page, 20);
      const [first, today] = await Promise.all([dayOfMonth(pat.page, 1), pat.page.evaluate(() => new Date().getDate())]);
      const todayKey = await dayOfMonth(pat.page, today);
      const grid = await cell(pat.page, id, first).waitFor({ timeout: 10_000 }).then(() => true, () => false);
      const frame = windowFrame(pat.page, id);
      const text = (await frame.textContent()) || '';
      if (!grid) throw new Error(`no dates show; the Calendar reads "${text.replace(/\s+/g, ' ').slice(0, 160)}"`);
      if (/is not connected/.test(text)) throw new Error('a "Google Calendar is not connected" box still covers the month');
      if ((await cell(pat.page, id, todayKey).getAttribute('aria-current')) !== 'date') throw new Error('today is not marked');
      await frame.getByRole('button', { name: 'Connect Google Calendar' }).click({ timeout: 5_000 });
      const why = await frame.getByText(/Google sign-in is not set up on this censaiOS/).count();
      await shot(pat.page, 'calendar-month-without-google');
      if (!why) throw new Error('Connect Google Calendar does not say why it cannot connect here');
      if (!(await frame.getByRole('button', { name: 'Add event', exact: true }).count())) throw new Error('there is no "Add event" button');
      return 'the month\'s dates show, today is marked, and Connect Google Calendar explains that Google sign-in is not set up here';
    });

    await check('walk', 'Pat clicks "Add event" and adds a made-up event on the 20th, 2 to 3 PM: it shows on that date', async ({ shot }) => {
      const frame = windowFrame(pat.page, id);
      await frame.getByRole('button', { name: 'Add event', exact: true }).click();
      await fillEvent(frame, { title: PATS, day: day20, from: [2, 'PM'], to: [3, 'PM'] });
      await shot(pat.page, 'pat-fills-in-a-made-up-event');
      await frame.getByRole('button', { name: 'Add to my calendar' }).click();
      const shown = await onDay(pat.page, id, day20, PATS);
      await shot(pat.page, 'event-on-its-date');
      const saved = (await myEvents(t, pat, pat.page)).events.find((e) => e.title === PATS);
      if (!shown) throw new Error(`"${PATS}" is not on the 20th`);
      if (!saved || saved.start !== await isoAt(pat.page, day20, '14:00') || saved.end !== await isoAt(pat.page, day20, '15:00')) {
        throw new Error(`the server has ${saved ? `${saved.start} to ${saved.end}` : 'no such event'}`);
      }
      patEvent = saved;
      return `"${PATS}" is on the 20th, saved from 2 to 3 PM`;
    });

    await check('walk', 'after a reload, and in a brand-new Calendar from the Add menu, the event is still on the 20th: it is Pat\'s calendar, not the window\'s', async ({ shot }) => {
      await openBoard(pat.page, t.workspaceId, t.web);
      const afterReload = await onDay(pat.page, id, day20, PATS, 20_000);
      await shot(pat.page, 'after-reload');
      await closeCalendars(pat.page);
      const opened = await addFromMenu(pat.page, 'Calendar');
      if (opened.kind !== 'calendar') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}, not Calendar`);
      id = opened.id;
      const inNew = await onDay(pat.page, id, day20, PATS);
      await shot(pat.page, 'new-calendar-window');
      if (!afterReload) throw new Error('after the reload the event is gone');
      if (!inNew) throw new Error('a new Calendar window does not show the event');
      return 'the event is on the 20th after the reload and in the new window';
    });

    await check('hunt', 'Sam, on the same board, sees the Calendar but not Pat\'s event; Sam\'s own event stays off Pat\'s screen; Sam cannot delete Pat\'s event', async ({ shot }) => {
      const seen = await cell(sam.page, id, day20).waitFor({ timeout: 15_000 }).then(() => true, () => false);
      if (!seen) throw new Error('the Calendar never showed on Sam\'s screen');
      const frame = windowFrame(sam.page, id);
      await frame.getByRole('button', { name: 'Add event', exact: true }).click();
      const day21 = await dayOfMonth(sam.page, 21);
      await fillEvent(frame, { title: SAMS, day: day21, from: [10, 'AM'], to: [11, 'AM'] });
      await frame.getByRole('button', { name: 'Add to my calendar' }).click();
      const samSees = await onDay(sam.page, id, day21, SAMS);
      await openBoard(pat.page, t.workspaceId, t.web);
      await onDay(pat.page, id, day20, PATS, 20_000);
      await sideBySide(t, 'each-sees-only-their-own', shot);
      const patSawSams = await cell(pat.page, id, day21).getByText(SAMS).count();
      const samSawPats = await windowFrame(sam.page, id).getByText(PATS).count();
      const sneak = await t.api(sam, 'DELETE', `/api/my-calendar/events/${patEvent?.id}`);
      const still = (await myEvents(t, pat, pat.page)).events.some((e) => e.title === PATS);
      if (!samSees) throw new Error('Sam\'s own event is not on Sam\'s 21st');
      if (samSawPats) throw new Error('Pat\'s event shows on Sam\'s screen');
      if (patSawSams) throw new Error('Sam\'s event shows on Pat\'s screen');
      if (sneak.status !== 404 || !still) throw new Error(`Sam deleting Pat's event answered ${sneak.status} and Pat's event is ${still ? 'still there' : 'gone'}`);
      return 'each screen shows only its own person\'s event, and Sam deleting Pat\'s event is refused (404)';
    });

    await check('walk', 'Pat opens the 20th: the event with its time, and "Add event on this day" starts the form on the 20th', async ({ shot }) => {
      const frame = windowFrame(pat.page, id);
      await cell(pat.page, id, day20).click();
      const dialog = frame.getByRole('dialog');
      const lists = await dialog.getByText(PATS, { exact: true }).count();
      const time = (await dialog.textContent()) || '';
      await shot(pat.page, 'the-20th-opened');
      await dialog.getByRole('button', { name: 'Add event on this day' }).click();
      const day = await frame.locator('input[type="date"]').inputValue();
      await shot(pat.page, 'add-event-on-this-day');
      await frame.locator('.hb-sched-composer').getByRole('button', { name: 'Close', exact: true }).click();
      if (!lists) throw new Error('the 20th does not list the event');
      if (!/02:00\s*PM\s*-\s*03:00\s*PM/.test(time)) throw new Error(`the 20th shows "${time.replace(/\s+/g, ' ').slice(0, 120)}"`);
      if (day !== day20) throw new Error(`"Add event on this day" opened the form on ${day}`);
      return `the 20th lists "${PATS}" at 02:00 PM - 03:00 PM; the form opened on ${day20}`;
    });

    await check('hunt', 'an event that ends before it starts is refused in plain words, on screen and by the server', async ({ shot }) => {
      const frame = windowFrame(pat.page, id);
      await frame.getByRole('button', { name: 'Add event', exact: true }).click();
      await fillEvent(frame, { title: `Made-up backwards ${run}`, day: day20, from: [3, 'PM'], to: [2, 'PM'] });
      const said = (await frame.getByRole('alert').textContent().catch(() => '')) || '';
      const blocked = await frame.getByRole('button', { name: 'Add to my calendar' }).isDisabled();
      await shot(pat.page, 'ends-before-it-starts');
      await frame.locator('.hb-sched-composer').getByRole('button', { name: 'Close', exact: true }).click();
      const [start, end] = await Promise.all([isoAt(pat.page, day20, '15:00'), isoAt(pat.page, day20, '14:00')]);
      const server = await t.api(pat, 'POST', '/api/my-calendar/events', { title: `Made-up backwards ${run}`, start, end });
      if (said !== 'It ends before it starts. Pick a later end time.' || !blocked) throw new Error(`the form says "${said}" and Add is ${blocked ? 'off' : 'on'}`);
      if (server.status !== 400 || server.body?.error !== 'The event has to end after it starts.') throw new Error(`the server answered ${server.status}: ${server.text.slice(0, 120)}`);
      return 'the form says "It ends before it starts" with Add switched off; the server answers 400 "The event has to end after it starts."';
    });

    await check('hunt', 'Delete asks first: "Keep it" keeps the event, "Delete it" removes it, and it stays gone after a reload', async ({ shot }) => {
      const frame = windowFrame(pat.page, id);
      await cell(pat.page, id, day20).click();
      const dialog = frame.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      const asked = await dialog.getByText('Delete this event?').count();
      await shot(pat.page, 'delete-asks-first');
      await dialog.getByRole('button', { name: 'Keep it' }).click();
      const kept = await dialog.getByText(PATS, { exact: true }).count();
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await dialog.getByRole('button', { name: 'Delete it' }).click();
      const emptied = await dialog.getByText('Nothing on this day yet.').waitFor({ timeout: 10_000 }).then(() => true, () => false);
      await pat.page.keyboard.press('Escape');
      await openBoard(pat.page, t.workspaceId, t.web);
      await cell(pat.page, id, day20).waitFor({ timeout: 20_000 });
      await pat.page.waitForTimeout(1500);
      const back = await cell(pat.page, id, day20).getByText(PATS).count();
      await shot(pat.page, 'deleted-and-reloaded');
      const onServer = (await myEvents(t, pat, pat.page)).events.some((e) => e.title === PATS);
      if (!asked) throw new Error('Delete removed the event without asking');
      if (!kept) throw new Error('"Keep it" did not keep the event');
      if (!emptied || back || onServer) throw new Error(`after "Delete it" the event is ${back ? 'back on the 20th after the reload' : onServer ? 'still saved' : 'still listed'}`);
      return 'asked "Delete this event?"; Keep it kept it; Delete it removed it, and the reload shows the 20th empty';
    });
  },
};
