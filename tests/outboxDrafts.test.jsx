/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { caretState, readTextCarets, setCaretChannel, sharedText } from '../src/lib/collaboration/textCarets.js';
import { OutboxWindow } from '../src/components/OutboxWindow.jsx';

// Outbox drafts (client emails and texts an agent wrote, waiting for a
// person to approve): rewriting one saves as you type, two people rewriting
// at once both keep their words (letter by letter), and each sees the
// other's cursor with their name. Only a spot goes out, never words. All
// people and addresses are made up.
const OLD = { id: 'd1', status: 'pending', channel: 'email', to: 'Sam Example', address: 'sam@example.com', subject: 'Thanks for visiting', body: 'Hi Sam, thanks for coming to the open house.', createdAt: '2026-11-01T10:00:00Z' };
const NEW = { id: 'd2', status: 'pending', channel: 'text', to: 'Pat Example', address: '555-0100', body: 'Hi Pat, the inspection is booked.', createdAt: '2026-11-02T10:00:00Z' };
const WIN = (drafts = [OLD, NEW]) => ({ id: 'o1', kind: 'outbox', x: 0, y: 0, w: 640, h: 560, drafts });
const SAM = { id: 'sam-1', name: 'Sam Example' };
const PAT = { id: 'pat-1', name: 'Pat Example' };
const withBody = (draft, body) => ({ ...draft, body });

function startBoth() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = { wins: [WIN()] };
  writeStateToDoc(a, null, base, 'local');
  sync();
  return { a, b, sync, base };
}
const draftsOf = (doc, base) => readDocState(doc, base).wins[0].drafts;

afterEach(() => {
  cleanup();
  act(() => setCaretChannel(null, null));
});

test('Pat and Sam rewriting the same message keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, { wins: [WIN([withBody(OLD, `Hello! ${OLD.body}`), NEW])] }, 'local');
  writeStateToDoc(b, base, { wins: [WIN([withBody(OLD, `${OLD.body} - Pat`), NEW])] }, 'local');
  sync();
  for (const doc of [a, b]) expect(draftsOf(doc, base)[0].body).toBe(`Hello! ${OLD.body} - Pat`);
});

test('Pat rewrites one draft while Sam approves another: both changes stay', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, { wins: [WIN([{ ...OLD, subject: 'Thanks for visiting today' }, NEW])] }, 'local');
  writeStateToDoc(b, base, { wins: [WIN([OLD, { ...NEW, status: 'approved' }])] }, 'local');
  sync();
  for (const doc of [a, b]) {
    const [first, second] = draftsOf(doc, base);
    expect([first.subject, second.status]).toEqual(['Thanks for visiting today', 'approved']);
  }
});

test('typing in a draft saves to the board at once, and Done closes the box', () => {
  const onUpdate = jest.fn();
  render(<OutboxWindow win={WIN()} onUpdate={onUpdate} />);
  const card = screen.getAllByTestId('outbox-draft').find((el) => el.textContent.includes('sam@example.com'));
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  fireEvent.change(within(card).getByLabelText('Message'), { target: { value: `${OLD.body}!` } });
  expect(onUpdate.mock.calls[0][0].drafts[0]).toMatchObject({ id: 'd1', body: `${OLD.body}!`, editedAt: expect.any(String) });
  fireEvent.click(within(card).getByRole('button', { name: 'Done' }));
  expect(within(card).queryByLabelText('Message')).toBeNull();
});

test("a teammate's letters show in the message, and your cursor stays put", () => {
  const view = render(<OutboxWindow win={WIN()} onUpdate={() => {}} />);
  const card = screen.getAllByTestId('outbox-draft').find((el) => el.textContent.includes('sam@example.com'));
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  const box = within(card).getByLabelText('Message');
  const at = OLD.body.indexOf('open') + 4;
  act(() => { box.focus(); box.setSelectionRange(at, at); });
  view.rerender(<OutboxWindow win={WIN([withBody(OLD, `Hello! ${OLD.body}`), NEW])} onUpdate={() => {}} />);
  expect(box.value).toBe(`Hello! ${OLD.body}`);
  expect(box.value.slice(0, box.selectionStart)).toMatch(/open$/);
});

// Pat has the Outbox open on board `a`; Sam's cursor arrives from board `b`.
function openOutbox(doc) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', PAT);
  act(() => setCaretChannel(doc, awareness));
  render(<OutboxWindow win={WIN()} onUpdate={() => {}} />);
  return awareness;
}
function samAt(b, pat, field, index) {
  const sam = new Awareness(b);
  sam.setLocalState({ user: SAM, caret: caretState(b, 'o1', field, index) });
  expect(JSON.stringify(sam.getLocalState().caret)).not.toContain('open house');
  act(() => {
    pat.states.set(sam.clientID, sam.getLocalState());
    pat.meta.set(sam.clientID, { clock: 1, lastUpdated: Date.now() });
    pat.emit('change', [{ added: [sam.clientID], updated: [], removed: [] }, 'remote']);
  });
}
const cardFor = (address) => screen.getAllByTestId('outbox-draft').find((el) => el.textContent.includes(address));
const editBox = (address, label) => {
  const card = cardFor(address);
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  return within(card).getByLabelText(label);
};
const markIn = (el) => el.parentElement.querySelector('[data-teammate-caret]');

test('each draft\'s subject and message are found as shared words, and nothing else is', () => {
  const { a } = startBoth();
  expect(sharedText(a, 'o1', 'drafts/0/body')?.toString()).toBe(OLD.body);
  expect(sharedText(a, 'o1', 'drafts/0/subject')?.toString()).toBe(OLD.subject);
  expect(sharedText(a, 'o1', 'drafts/1/body')?.toString()).toBe(NEW.body);
  expect(sharedText(a, 'o1', 'drafts/0/to')).toBeNull();
  expect(sharedText(a, 'o1', 'drafts/5/body')).toBeNull();
});

test("a message shows a teammate's cursor with their name, only in that draft, and it moves with the words", () => {
  const { a, b } = startBoth();
  const pat = openOutbox(a);
  samAt(b, pat, 'drafts/0/body', 'Hi Sam'.length);
  // The newer draft is listed first, but Sam's cursor is in the older one.
  const message = editBox('sam@example.com', 'Message');
  expect(markIn(message)).toHaveAttribute('data-at', '6');
  expect(markIn(message)).toHaveTextContent('Sam Example');
  expect(markIn(within(cardFor('sam@example.com')).getByLabelText('Subject'))).toBeNull();
  expect(markIn(editBox('555-0100', 'Message'))).toBeNull();
  act(() => {
    sharedText(b, 'o1', 'drafts/0/body').insert(0, 'Hello! ');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  });
  expect(markIn(message)).toHaveAttribute('data-at', '13');
});

test('typing in a draft tells teammates where my cursor is, and leaving takes it away', () => {
  const { a } = startBoth();
  const awareness = openOutbox(a);
  jest.useFakeTimers();
  try {
    const el = editBox('555-0100', 'Message');
    act(() => { el.focus(); el.setSelectionRange(2, 2); fireEvent.keyUp(el, { key: 'ArrowRight' }); jest.runOnlyPendingTimers(); });
    const sent = awareness.getLocalState().caret;
    expect(sent).toEqual(expect.objectContaining({ windowId: 'o1', field: 'drafts/1/body' }));
    expect(JSON.stringify(sent)).not.toContain('inspection');
    expect(readTextCarets(new Map([[9, { user: SAM, caret: sent }]]), 1, a, 'o1', sent.field)[0].index).toBe(2);
    act(() => { el.blur(); });
    expect(awareness.getLocalState().caret).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
