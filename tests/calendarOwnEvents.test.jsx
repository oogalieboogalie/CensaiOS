/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, within } from '@testing-library/react';
import { jest } from '@jest/globals';

// The Calendar without Google: the month shows, "Add event" puts made-up
// events on this person's own calendar, and Google stays an option.
const store = { own: [], google: null, googleSetUp: false, nextId: 1, hold: null };
const NOT_CONNECTED = 'Not authenticated with Google';
jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: {
    getMyCalendarEvents: jest.fn(async (start, end) => {
      const answer = store.own.filter((ev) => ev.start < end && ev.end > start);
      return store.hold ? store.hold(answer) : answer;
    }),
    addMyCalendarEvent: jest.fn(async (ev) => {
      const saved = { ...ev, id: store.nextId++, source: 'own' };
      store.own.push(saved);
      return saved;
    }),
    deleteMyCalendarEvent: jest.fn(async (id) => { store.own = store.own.filter((ev) => ev.id !== id); }),
    getCalendarEvents: jest.fn(async () => {
      if (!store.google) throw Object.assign(new Error(NOT_CONNECTED), { googleSetUp: store.googleSetUp });
      return store.google;
    }),
    addCalendarEvent: jest.fn(async (ev) => {
      store.google.push({ ...ev, id: `g${store.nextId++}`, link: 'https://calendar.google.com/made-up', color: 'var(--ps-blue)' });
      return { ok: true };
    }),
  },
}));
const { api } = await import('../src/lib/api.js');
const { CalendarWindow } = await import('../src/components/CalendarWindow.jsx');
const { localDay } = await import('../src/lib/schedule/plainWords.js');
const { shiftMonth } = await import('../src/components/calendar/CalendarToolbar.jsx');

const now = new Date();
const dayOf = (n, month = now.getMonth()) => localDay(new Date(now.getFullYear(), month, n));
const at = (day, hhmm) => new Date(`${day}T${hhmm}:00`).toISOString();
const ownEvent = (title, day, from = '14:00', to = '15:00') => ({ id: store.nextId++, title, description: '', start: at(day, from), end: at(day, to), source: 'own' });

async function openCalendar() {
  const view = render(<CalendarWindow win={{ id: `cal-${store.nextId++}` }} onUpdate={() => {}} />);
  await act(async () => {});
  return view;
}
const cell = (container, day) => container.querySelector(`[data-day="${day}"]`);
async function click(el) { await act(async () => { fireEvent.click(el); }); }
async function pickTime(container, which, hour, half) {
  const group = within(container).getByRole('group', { name: which });
  await act(async () => { fireEvent.change(within(group).getByLabelText('Hour'), { target: { value: String(hour) } }); });
  await click(within(group).getByRole('button', { name: half }));
}

beforeEach(() => {
  window.localStorage.clear();
  Object.assign(store, { own: [], google: null, googleSetUp: false, hold: null });
  jest.clearAllMocks();
});

test('without Google the month still shows every day, today marked, and no "not connected" box', async () => {
  const { container } = await openCalendar();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  expect(cell(container, dayOf(1))).not.toBeNull();
  expect(cell(container, dayOf(last))).not.toBeNull();
  expect(cell(container, localDay(now)).getAttribute('aria-current')).toBe('date');
  expect(container.textContent).not.toMatch(/is not connected/);
  expect(within(container).getByRole('button', { name: 'Add event' })).toBeTruthy();
});

test('Connect Google stays as an option: a link when Google sign-in is set up, plain words when it is not', async () => {
  const notSetUp = await openCalendar();
  await click(within(notSetUp.container).getByRole('button', { name: 'Connect Google Calendar' }));
  expect(notSetUp.container.textContent).toMatch(/Google sign-in is not set up on this censaiOS/);
  notSetUp.unmount();
  store.googleSetUp = true;
  const setUp = await openCalendar();
  expect(within(setUp.container).getByRole('link', { name: 'Connect Google Calendar' }).getAttribute('href')).toBe('/api/auth/google');
});

test('Add event puts a made-up event on its date, on your own calendar', async () => {
  const { container } = await openCalendar();
  const day = dayOf(15);
  await click(within(container).getByRole('button', { name: 'Add event' }));
  await act(async () => { fireEvent.change(within(container).getByLabelText('Event title'), { target: { value: 'Made-up dentist' } }); });
  await act(async () => { fireEvent.change(container.querySelector('input[type="date"]'), { target: { value: day } }); });
  await pickTime(container, 'Starts', 2, 'PM');
  await pickTime(container, 'Ends', 3, 'PM');
  await click(within(container).getByRole('button', { name: 'Add to my calendar' }));
  expect(api.addMyCalendarEvent).toHaveBeenCalledWith({ title: 'Made-up dentist', start: at(day, '14:00'), end: at(day, '15:00'), description: '' });
  expect(api.addCalendarEvent).not.toHaveBeenCalled();
  expect(within(cell(container, day)).getByText('Made-up dentist')).toBeTruthy();
  expect(cell(container, day).getAttribute('aria-label')).toMatch(/1 event$/);
});

test('an event that ends before it starts says so and cannot be added', async () => {
  const { container } = await openCalendar();
  await click(within(container).getByRole('button', { name: 'Add event' }));
  await act(async () => { fireEvent.change(within(container).getByLabelText('Event title'), { target: { value: 'Made-up' } }); });
  await pickTime(container, 'Starts', 3, 'PM');
  await pickTime(container, 'Ends', 2, 'PM');
  expect(within(container).getByRole('alert').textContent).toBe('It ends before it starts. Pick a later end time.');
  expect(within(container).getByRole('button', { name: 'Add to my calendar' }).disabled).toBe(true);
});

test('a day opens with its events, and "Add event on this day" starts the form on that day', async () => {
  const day = dayOf(20);
  store.own.push(ownEvent('Made-up haircut', day));
  const { container } = await openCalendar();
  await click(cell(container, day));
  const dialog = within(container).getByRole('dialog');
  expect(within(dialog).getByText('Made-up haircut')).toBeTruthy();
  await click(within(dialog).getByRole('button', { name: 'Add event on this day' }));
  expect(within(container).queryByRole('dialog')).toBeNull();
  expect(container.querySelector('input[type="date"]').value).toBe(day);
});

test('Delete asks first: Keep it (or Escape) keeps the event, Delete it removes it', async () => {
  const day = dayOf(18);
  store.own.push(ownEvent('Made-up oil change', day));
  const { container } = await openCalendar();
  await click(cell(container, day));
  const dialog = () => within(container).getByRole('dialog');
  await click(within(dialog()).getByRole('button', { name: 'Delete' }));
  expect(document.activeElement.textContent).toBe('Keep it');
  await click(within(dialog()).getByRole('button', { name: 'Keep it' }));
  expect(document.activeElement.textContent).toBe('Delete');
  await click(within(dialog()).getByRole('button', { name: 'Delete' }));
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  expect(within(dialog()).getByText('Made-up oil change')).toBeTruthy();
  expect(within(dialog()).queryByRole('alertdialog')).toBeNull();
  await click(within(dialog()).getByRole('button', { name: 'Delete' }));
  await click(within(dialog()).getByRole('button', { name: 'Delete it' }));
  expect(api.deleteMyCalendarEvent).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(dialog());
  expect(within(dialog()).getByText('Nothing on this day yet.')).toBeTruthy();
  expect(within(cell(container, day)).queryByText('Made-up oil change')).toBeNull();
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  expect(within(container).queryByRole('dialog')).toBeNull();
});

test('a busy day says how many more events it holds', async () => {
  const day = dayOf(9);
  for (const n of [1, 2, 3, 4]) store.own.push(ownEvent(`Made-up ${n}`, day, `0${n}:00`, `0${n}:30`));
  const { container } = await openCalendar();
  expect(within(cell(container, day)).getAllByText(/^Made-up \d$/)).toHaveLength(2);
  expect(within(cell(container, day)).getByText('+2 more')).toBeTruthy();
});

test('with Google connected both calendars show, and the form can still pick My calendar', async () => {
  const day = dayOf(12);
  store.google = [{ id: 'g-1', title: 'Made-up stand-up', start: at(day, '09:00'), end: at(day, '09:15'), link: 'https://calendar.google.com/made-up', color: 'var(--ps-blue)' }];
  store.own.push(ownEvent('Made-up lunch', day, '12:00', '13:00'));
  const { container } = await openCalendar();
  expect(within(cell(container, day)).getByText('Made-up stand-up')).toBeTruthy();
  expect(within(cell(container, day)).getByText('Made-up lunch')).toBeTruthy();
  expect(container.textContent).toMatch(/yours \+ Google/);
  await click(within(container).getByRole('button', { name: 'Add event' }));
  const choice = within(container).getByRole('group', { name: 'Add to' });
  expect(within(choice).getByRole('button', { name: 'Google Calendar' }).getAttribute('aria-pressed')).toBe('true');
  await click(within(choice).getByRole('button', { name: 'My calendar' }));
  await act(async () => { fireEvent.change(within(container).getByLabelText('Event title'), { target: { value: 'Made-up walk' } }); });
  await click(within(container).getByRole('button', { name: 'Add to my calendar' }));
  expect(api.addMyCalendarEvent).toHaveBeenCalledTimes(1);
  expect(api.addCalendarEvent).not.toHaveBeenCalled();
});

test("a late answer for a month the person already left does not paint over the new month", async () => {
  const day = dayOf(5);
  store.own.push(ownEvent('Made-up this month', day));
  let release;
  store.hold = (answer) => new Promise((resolve) => { release = () => resolve(answer); });
  const { container } = await openCalendar();
  store.hold = null;
  await click(within(container).getByText('Next'));
  release();
  await act(async () => {});
  expect(container.textContent).not.toMatch(/Made-up this month/);
  expect(cell(container, dayOf(5, now.getMonth() + 1))).not.toBeNull();
});

test('the week list shows your own events as plain names, with no Google page to open', async () => {
  const today = localDay(now);
  store.own.push(ownEvent('Made-up call', today, '16:00', '16:30'));
  const { container } = await openCalendar();
  await click(within(container).getByText('List'));
  const name = within(container).getByText('Made-up call');
  expect(name.tagName).toBe('SPAN');
  expect(name.closest('a')).toBeNull();
});

test('a day opened from the keyboard takes the keyboard, keeps Tab inside, and gives it back to the day', async () => {
  const day = dayOf(16);
  store.own.push(ownEvent('Made-up piano lesson', day));
  const { container } = await openCalendar();
  cell(container, day).focus();
  await click(cell(container, day));
  const dialog = within(container).getByRole('dialog');
  expect(document.activeElement).toBe(dialog);
  await act(async () => { fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true }); });
  expect(document.activeElement.textContent).toBe('Add event on this day');
  await act(async () => { fireEvent.keyDown(document.activeElement, { key: 'Tab' }); });
  expect(document.activeElement.getAttribute('aria-label')).toBe('Close');
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  expect(within(container).queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(cell(container, day));
});

test('a day opened over the new-event form closes first on Escape, and the form keeps what was typed', async () => {
  const { container } = await openCalendar();
  await click(within(container).getByRole('button', { name: 'Add event' }));
  await act(async () => { fireEvent.change(within(container).getByLabelText('Event title'), { target: { value: 'Made-up recital' } }); });
  await click(cell(container, dayOf(22)));
  expect(within(container).getByRole('dialog')).toBeTruthy();
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  expect(within(container).queryByRole('dialog')).toBeNull();
  expect(within(container).getByLabelText('Event title').value).toBe('Made-up recital');
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  expect(within(container).queryByLabelText('Event title')).toBeNull();
});

test('events on one day are in time order across both calendars', async () => {
  const day = dayOf(13);
  store.google = [{ id: 'g-2', title: 'Made-up 9 am call', start: at(day, '09:00'), end: at(day, '09:30'), link: 'https://calendar.google.com/made-up', color: 'var(--ps-blue)' }];
  store.own.push(ownEvent('Made-up noon lunch', day, '12:00', '13:00'), ownEvent('Made-up 5 pm walk', day, '17:00', '17:30'));
  const { container } = await openCalendar();
  const chips = [...cell(container, day).querySelectorAll('.hb-cal-chip')].map((chip) => chip.textContent);
  expect(chips).toEqual(['Made-up 9 am call', 'Made-up noon lunch']);
  expect(within(cell(container, day)).getByText('+1 more')).toBeTruthy();
});

test('the form waits while Google is still answering, and still offers Google when it did not answer', async () => {
  let answerGoogle;
  api.getCalendarEvents.mockImplementationOnce(() => new Promise((_, reject) => {
    answerGoogle = () => reject(new Error('Google Calendar could not read the events just now.'));
  }));
  const { container } = await openCalendar();
  await click(within(container).getByRole('button', { name: 'Add event' }));
  await act(async () => { fireEvent.change(within(container).getByLabelText('Event title'), { target: { value: 'Made-up review' } }); });
  expect(within(container).getByRole('button', { name: 'Checking your calendars...' }).disabled).toBe(true);
  await act(async () => { answerGoogle(); });
  const choice = within(container).getByRole('group', { name: 'Add to' });
  expect(within(choice).getByRole('button', { name: 'Google Calendar' }).getAttribute('aria-pressed')).toBe('true');
  expect(within(container).getByRole('button', { name: 'Add to Google Calendar' }).disabled).toBe(false);
});

test('an event saved after moving on to the next month leaves the next month on screen', async () => {
  const next = dayOf(5, now.getMonth() + 1);
  store.own.push(ownEvent('Made-up next month', next));
  let finishSave;
  api.addMyCalendarEvent.mockImplementationOnce((ev) => new Promise((resolve) => {
    finishSave = () => { const saved = { ...ev, id: store.nextId++, source: 'own' }; store.own.push(saved); resolve(saved); };
  }));
  const { container } = await openCalendar();
  await click(within(container).getByRole('button', { name: 'Add event' }));
  await act(async () => { fireEvent.change(within(container).getByLabelText('Event title'), { target: { value: 'Made-up save' } }); });
  await click(within(container).getByRole('button', { name: 'Add to my calendar' }));
  await click(within(container).getByText('Next'));
  expect(within(cell(container, next)).getByText('Made-up next month')).toBeTruthy();
  await act(async () => { finishSave(); });
  expect(within(container).queryByLabelText('Event title')).toBeNull();
  expect(within(cell(container, next)).getByText('Made-up next month')).toBeTruthy();
});

test('Next and Prev from the 29th to the 31st go one month, never two', async () => {
  expect(localDay(shiftMonth(new Date(2026, 9, 31), 1))).toBe('2026-11-30');
  expect(localDay(shiftMonth(new Date(2027, 0, 29), 1))).toBe('2027-02-28');
  expect(localDay(shiftMonth(new Date(2028, 0, 31), 1))).toBe('2028-02-29');
  expect(localDay(shiftMonth(new Date(2026, 2, 31), -1))).toBe('2026-02-28');
  expect(localDay(shiftMonth(new Date(2026, 11, 31), 1))).toBe('2027-01-31');
  const win = { id: 'cal-on-the-31st' };
  window.localStorage.setItem('homebase.calendar.view.v1', JSON.stringify({ [win.id]: { viewMode: 'month', currentDate: new Date(2026, 9, 31, 12).toISOString() } }));
  const { container } = render(<CalendarWindow win={win} onUpdate={() => {}} />);
  await act(async () => {});
  await click(within(container).getByText('Next'));
  expect(within(container).getByText('Nov 2026')).toBeTruthy();
  expect(cell(container, '2026-11-30')).not.toBeNull();
  await click(within(container).getByText('Prev'));
  expect(within(container).getByText('Oct 2026')).toBeTruthy();
});
