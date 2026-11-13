/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { BriefForm } from '../src/components/leadhound/BriefForm.jsx';

// The LeadHound brief merges box by box and letter by letter: Pat and Sam
// filling in one brief at the same moment both keep what they typed, and each
// sees the other's words as they type (before, the brief stayed on one screen
// until someone pressed Find leads). All words are made up.
const LOCAL = 'local';
const BRIEF = { business: 'We bake bread for Sam Example Cafe', market: 'Small cafes', region: 'Exampleton', maxLeads: 3 };
const board = (leadBrief) => ({ wins: [{ id: 'h1', kind: 'leadHound', x: 0, y: 0, w: 1000, h: 720, leadBrief }] });

function startBoth() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = board(BRIEF);
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync, base };
}

const briefOf = (doc, base) => readDocState(doc, base).wins[0].leadBrief;

afterEach(cleanup);

test('Pat types the market while Sam changes the region: both changes stay', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ ...BRIEF, market: 'Small cafes and bakeries' }), LOCAL);
  writeStateToDoc(b, base, board({ ...BRIEF, region: 'Exampleton, TX' }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const brief = briefOf(doc, base);
    expect([brief.market, brief.region]).toEqual(['Small cafes and bakeries', 'Exampleton, TX']);
  }
});

test('Pat and Sam typing in the same box keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ ...BRIEF, business: `Fresh: ${BRIEF.business}` }), LOCAL);
  writeStateToDoc(b, base, board({ ...BRIEF, business: `${BRIEF.business} and diners` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(briefOf(doc, base).business).toBe(`Fresh: ${BRIEF.business} and diners`);
});

test('typing in a box hands the change to the window right away', () => {
  const changes = [];
  render(<BriefForm brief={{}} onChange={(p) => changes.push(p)} running={false} onSubmit={() => {}} />);
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Exampleton' } });
  fireEvent.change(screen.getByLabelText('How many leads'), { target: { value: '5' } });
  expect(changes).toEqual([{ region: 'Exampleton' }, { maxLeads: 5 }]);
});

test("a teammate's words show in your brief, and your cursor stays put", () => {
  const props = { onChange: () => {}, running: false, onSubmit: () => {} };
  const view = render(<BriefForm brief={BRIEF} {...props} />);
  const box = screen.getByPlaceholderText(/AI receptionists/);
  box.focus();
  const at = BRIEF.business.indexOf('bread') + 5;
  box.setSelectionRange(at, at);
  view.rerender(<BriefForm brief={{ ...BRIEF, business: `Pat: ${BRIEF.business}` }} {...props} />);
  expect(box.value).toBe(`Pat: ${BRIEF.business}`);
  expect(box.value.slice(0, box.selectionStart)).toMatch(/bread$/);
});

test('Find leads sends the shared brief, trimmed', () => {
  const sent = [];
  render(<BriefForm brief={{ ...BRIEF, market: ' Small cafes ' }} onChange={() => {}} running={false} onSubmit={(b) => sent.push(b)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find leads' }));
  expect(sent).toEqual([{ ...BRIEF, market: 'Small cafes' }]);
});
