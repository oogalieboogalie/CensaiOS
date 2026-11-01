/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, render, within } from '@testing-library/react';
import { jest } from '@jest/globals';

// Sam and Pat on one board with one Calendar. Which month and view each of
// them is on is their own; it never goes into the board's shared window.
jest.unstable_mockModule('../src/lib/api.js', () => ({ api: { getCalendarEvents: jest.fn(async () => []), getMyCalendarEvents: jest.fn(async () => []) } }));
const { CalendarWindow } = await import('../src/components/CalendarWindow.jsx');
const { pendingAppLog } = await import('../src/lib/appLog/browserLog.js');

function SharedBoard({ initial, writes }) {
  const [win, setWin] = React.useState(initial);
  const onUpdate = React.useCallback((patch) => { writes.push(patch); setWin((w) => ({ ...w, ...patch })); }, [writes]);
  return (
    <>
      <div data-person="sam"><CalendarWindow win={win} onUpdate={onUpdate} /></div>
      <div data-person="pat"><CalendarWindow win={win} onUpdate={onUpdate} /></div>
    </>
  );
}

const label = (box) => box.querySelector('span[style*="width: 60"]')?.textContent;
const month = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

beforeEach(() => { window.localStorage.clear(); });

test("Sam going to next month and list view leaves Pat's Calendar where it was", async () => {
  const writes = [];
  const { container } = render(<SharedBoard initial={{ id: 'cal1', title: 'Team calendar' }} writes={writes} />);
  await act(async () => {});
  const sam = container.querySelector('[data-person="sam"]');
  const pat = container.querySelector('[data-person="pat"]');
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  await act(async () => { within(sam).getByText('Next').click(); });
  await act(async () => { within(sam).getByText('List').click(); });
  expect(label(sam)).toBe(month(next));
  expect(label(pat)).toBe(month(now));
  expect(writes.filter((w) => w.data?.calendar)).toEqual([]);
});

test('a view someone saved into the shared window is set aside, with one log line', async () => {
  const writes = [];
  const old = { viewMode: 'list', currentDate: new Date(2020, 0, 5).toISOString(), selectedDateStr: null, isComposing: false };
  const { container } = render(<SharedBoard initial={{ id: 'cal2', data: { calendar: old, prefillKeep: 1 } }} writes={writes} />);
  await act(async () => {});
  expect(label(container.querySelector('[data-person="pat"]'))).toBe(month(new Date()));
  expect(writes.some((w) => w.data && !('calendar' in w.data) && w.data.prefillKeep === 1)).toBe(true);
  const lines = pendingAppLog().filter((e) => e.where === 'calendar').map((e) => e.message);
  expect(lines).toContain('calendar: set aside a view saved into the shared board window; each person keeps their own now');
});

test("each person's own view comes back after a reload", async () => {
  const writes = [];
  const first = render(<SharedBoard initial={{ id: 'cal3' }} writes={writes} />);
  await act(async () => {});
  await act(async () => { within(first.container.querySelector('[data-person="sam"]')).getByText('List').click(); });
  first.unmount();
  const { container } = render(<CalendarWindow win={{ id: 'cal3' }} onUpdate={() => {}} />);
  await act(async () => {});
  expect(within(container).getByText('List').style.fontWeight).toBe('600');
  expect(within(container).getByText('List').style.background).toContain('hairline');
});
