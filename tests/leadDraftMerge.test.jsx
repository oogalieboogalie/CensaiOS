/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { LeadDetail } from '../src/components/leadhound/LeadDetail.jsx';

// A LeadHound lead's drafts (each day's subject and message, and the ice
// breaker) merge letter by letter: Pat and Sam rewriting them at the same
// moment both keep what they typed (before, the whole hunt was saved as one
// piece, so the last one to type wiped out the other's words). All words
// and businesses are made up.
const LOCAL = 'local';
const DAY1 = 'Hi Sam, we bake rye bread every morning.';
const DAY3 = 'Following up on the rye bread samples.';
const OPENING = 'Your cafe line is out the door on Saturdays.';
const lead = (seq = [DAY1, DAY3], ice = {}) => ({
  company: 'Sam Example Cafe', url: 'https://cafe.example', host: 'cafe.example', fitScore: 88,
  sequence: [
    { day: 1, channel: 'email', subject: 'Fresh bread', body: seq[0] },
    { day: 3, channel: 'email', subject: 'Samples', body: seq[1] },
  ],
  iceBreaker: { title: 'Weekend bread menu', opening_line: OPENING, deliverable: '- Rye\n- Sourdough', cta: 'Can I drop off a loaf?', ...ice },
});
const hunt = (leads) => ({ brief: { business: 'Pat Example Bakery' }, result: { brief: { business: 'Pat Example Bakery' }, leads } });
const board = (leads = [lead()]) => ({
  wins: [{ id: 'h1', kind: 'leadHound', x: 0, y: 0, w: 1000, h: 720, leadHound: hunt(leads) }],
});

function startBoth() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = board();
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync, base };
}

const leadsOf = (doc, base) => readDocState(doc, base).wins[0].leadHound.result.leads;
const bodies = (doc, base) => leadsOf(doc, base)[0].sequence.map((t) => t.body);

afterEach(cleanup);

test('Pat rewrites Day 1 while Sam rewrites Day 3: both changes stay', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([lead([`${DAY1} Want a sample?`, DAY3])]), LOCAL);
  writeStateToDoc(b, base, board([lead([DAY1, `${DAY3} Any thoughts?`])]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(bodies(doc, base)).toEqual([`${DAY1} Want a sample?`, `${DAY3} Any thoughts?`]);
});

test('Pat and Sam typing in the same message keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([lead([`Hello! ${DAY1}`, DAY3])]), LOCAL);
  writeStateToDoc(b, base, board([lead([`${DAY1} - Sam Example`, DAY3])]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(bodies(doc, base)[0]).toBe(`Hello! ${DAY1} - Sam Example`);
});

test('typing on after a teammate letters landed keeps merging', () => {
  const { a, b, sync, base } = startBoth();
  const one = board([lead([`Hello! ${DAY1}`, DAY3])]);
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  const seen = readDocState(b, base);
  writeStateToDoc(b, seen, board([lead([`Hello! ${DAY1} Thanks`, DAY3])]), LOCAL);
  writeStateToDoc(a, one, board([lead([`Hello! ${DAY1}`, DAY3], { cta: 'Can I drop off two loaves?' })]), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const [first] = leadsOf(doc, base);
    expect([first.sequence[0].body, first.iceBreaker.cta]).toEqual([`Hello! ${DAY1} Thanks`, 'Can I drop off two loaves?']);
  }
});

test('the ice breaker opening line and title merge letter by letter too', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board([lead(undefined, { opening_line: `Pat here. ${OPENING}` })]), LOCAL);
  writeStateToDoc(b, base, board([lead(undefined, { opening_line: `${OPENING} Love it.`, title: 'Weekend bread menu v2' })]), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const ice = leadsOf(doc, base)[0].iceBreaker;
    expect([ice.opening_line, ice.title]).toEqual([`Pat here. ${OPENING} Love it.`, 'Weekend bread menu v2']);
  }
});

test('a new hunt still replaces the old leads whole', () => {
  const { a, b, sync, base } = startBoth();
  const fresh = { ...lead([DAY1, DAY3]), company: 'Pat Example Diner', url: 'https://diner.example' };
  writeStateToDoc(a, base, board([fresh, lead()]), LOCAL);
  sync();
  for (const doc of [a, b]) expect(leadsOf(doc, base).map((l) => l.company)).toEqual(['Pat Example Diner', 'Sam Example Cafe']);
});

test('typing a message hands the change to the window at once', () => {
  const edits = [];
  render(<LeadDetail lead={lead()} onBank={async () => ({})} onEdit={(p) => edits.push(p)} />);
  fireEvent.change(screen.getByLabelText('Day 3 message'), { target: { value: `${DAY3}!` } });
  expect(edits[0].sequence.map((t) => t.body)).toEqual([DAY1, `${DAY3}!`]);
});

test("a teammate's letters show in the message, and your cursor stays put", () => {
  const props = { onBank: async () => ({}), onEdit: () => {} };
  const view = render(<LeadDetail lead={lead()} {...props} />);
  const box = screen.getByLabelText('Day 1 message');
  const at = DAY1.indexOf('rye') + 3;
  act(() => { box.focus(); box.setSelectionRange(at, at); });
  view.rerender(<LeadDetail lead={lead([`Hello! ${DAY1}`, DAY3])} {...props} />);
  expect(box.value).toBe(`Hello! ${DAY1}`);
  expect(box.value.slice(0, box.selectionStart)).toMatch(/rye$/);
});
