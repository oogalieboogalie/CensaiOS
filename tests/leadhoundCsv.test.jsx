/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';

const logLines = [];
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logToApp: (level, message, options) => logLines.push({ level, message, options }),
}));

const { CSV_COLUMNS, csvCell, leadsToCsv } = await import('../src/components/leadhound/leadsCsv.js');
const { LeadResults } = await import('../src/components/leadhound/LeadResults.jsx');

// Made-up leads for a made-up business (Bright Paws Dog Grooming).
const LEADS = [
  { company: 'Happy Tails Kennel', url: 'https://happytails.example', host: 'happytails.example', fitScore: 91,
    why_fit: 'Boards 40 dogs a week, says "groomed on pickup" is their top ask', contacts: { emails: ['pat@happytails.example'], phones: ['555-0101'], linkedin: 'https://linkedin.com/company/happytails' },
    iceBreaker: { title: 'Pickup-day grooming menu', opening_line: 'Saw your pickup reviews, Pat' } },
  { company: 'Sam, Mo & Co Vets', url: 'https://smvets.example', host: 'smvets.example', fitScore: 78,
    why_fit: 'Two clinics, no groomer on site', contacts: { emails: ['front@smvets.example', 'sam@smvets.example'], phones: [] } },
  { company: 'Jordan Pet Supply', url: 'https://jordanpets.example', host: 'jordanpets.example', fitScore: 64,
    why_fit: '=HYPERLINK("x") style text stays text', contacts: {} },
];

/** A small CSV reader (quotes, doubled quotes, commas and line breaks in cells). */
function parseCsv(text) {
  const rows = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { rows.at(-1).push(cell); cell = ''; } else if (ch === '\r') { /* part of \r\n */ } else if (ch === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); } else cell += ch;
  }
  if (cell || rows.at(-1).length) rows.at(-1).push(cell);
  return rows.filter((r) => r.length);
}

beforeEach(() => { logLines.length = 0; });

test('three leads give a header and three rows with the right columns', () => {
  const rows = parseCsv(leadsToCsv(LEADS));
  expect(rows[0]).toEqual(CSV_COLUMNS);
  expect(rows).toHaveLength(4);
  expect(rows[1]).toEqual(['Happy Tails Kennel', 'https://happytails.example', 'pat@happytails.example', '555-0101',
    'https://linkedin.com/company/happytails', '91', 'Boards 40 dogs a week, says "groomed on pickup" is their top ask',
    'Pickup-day grooming menu: Saw your pickup reviews, Pat']);
  expect(rows[2][0]).toBe('Sam, Mo & Co Vets');
  expect(rows[2][2]).toBe('front@smvets.example; sam@smvets.example');
  expect(rows.every((r) => r.length === CSV_COLUMNS.length)).toBe(true);
});

test('commas and quotes stay in their own cell, and formulas stay text', () => {
  expect(csvCell('a, "b"')).toBe('"a, ""b"""');
  expect(csvCell('=1+1')).toBe("'=1+1");
  expect(parseCsv(leadsToCsv(LEADS))[3][6]).toBe('\'=HYPERLINK("x") style text stays text');
});

test('the results list has Download CSV, and the log line holds only the count', () => {
  const clicks = [];
  global.URL.createObjectURL = () => 'blob:leads';
  global.URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function click() { clicks.push(this.download); };
  render(<LeadResults result={{ leads: LEADS, brief: { business: 'Bright Paws Dog Grooming', market: 'kennels near Pat' } }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  expect(clicks).toHaveLength(1);
  expect(clicks[0]).toMatch(/^leads-kennels-near-pat-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(logLines).toEqual([{ level: 'info', message: 'leadhound: downloaded 3 leads as a spreadsheet', options: { where: 'leadhound' } }]);
});

test('no leads, no button', () => {
  render(<LeadResults result={{ leads: [] }} />);
  expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
});
