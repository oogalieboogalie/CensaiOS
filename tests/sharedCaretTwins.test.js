import * as Y from 'yjs';
import { diffText, diffTextAt, mergeLocalEditOp, rebaseCaret, rebaseThrough, applyTextDiff } from '../shared/collab/textDiff.js';
import {
  opsFromDelta, collectTextEvents, recordRemoteText, remoteOps, noteLocalEdit, takeLocalEdit, resetTextEdits,
} from '../src/lib/collaboration/remoteTextEdits.js';

// Item 135: Pat and Sam type two lines that start with the same words into one
// note at the same moment. A caret moved by a text diff guesses wrong in the
// repeated words; the shared doc's own record of the change does not.
const PAT = 'Made-up list: Pat brings bread.';
const SAM = 'Made-up list: Sam brings jam.';

function typeAtOnce(useDocRecord) {
  const people = [PAT, SAM].map((words, n) => {
    const doc = new Y.Doc();
    doc.clientID = n + 1;
    const text = doc.getText('note');
    const who = { doc, text, words, caret: 0, view: '' };
    text.observe((event, tr) => {
      if (tr.local) return;
      const after = text.toString();
      who.caret = useDocRecord
        ? rebaseThrough(who.caret, opsFromDelta(event.delta))
        : rebaseCaret(who.caret, diffText(who.view, after));
      who.view = after;
    });
    return who;
  });
  for (let i = 0; i < Math.max(PAT.length, SAM.length); i += 1) {
    const updates = people.map((p) => {
      if (i >= p.words.length) return null;
      const next = p.view.slice(0, p.caret) + p.words[i] + p.view.slice(p.caret);
      const op = diffTextAt(p.view, next, p.caret);
      let update = null;
      p.doc.once('update', (u) => { update = u; });
      p.doc.transact(() => applyTextDiff(p.text, op));
      p.view = next;
      p.caret += 1;
      return update;
    });
    updates.forEach((u, from) => { if (u) Y.applyUpdate(people[1 - from].doc, u, 'remote'); });
  }
  return people.map((p) => p.text.toString());
}

test('with the shared doc\'s own record, both lines come out whole on both screens', () => {
  const [pat, sam] = typeAtOnce(true);
  expect(pat).toBe(sam);
  expect(pat).toContain(PAT);
  expect(pat).toContain(SAM);
});

test('the old diff guess scrambles the same typing (the bug item 135 fixes)', () => {
  const [pat] = typeAtOnce(false);
  expect(pat.includes(PAT) && pat.includes(SAM)).toBe(false);
});

test('a caret pins the typed spot in repeated letters', () => {
  expect(diffText('Ma', 'MaMa')).toEqual({ index: 2, remove: 0, insert: 'Ma' });
  expect(diffTextAt('Ma', 'MaMa', 0)).toEqual({ index: 0, remove: 0, insert: 'Ma' });
  expect(diffTextAt('aaa', 'aa', 0)).toEqual({ index: 0, remove: 1, insert: '' });
  expect(diffTextAt('abc', 'xyz', 1)).toEqual(diffText('abc', 'xyz'));
  // Sam typed "d" after his own "Ma" while Pat's "Ma" landed in front of it.
  const { text, op } = mergeLocalEditOp('Ma', 'Mad', 'MaMa', { caret: 3, theirs: [{ index: 0, remove: 0, insert: 'Ma' }] });
  expect(text).toBe('MaMad');
  expect(op).toEqual({ index: 4, remove: 0, insert: 'd' });
  expect(mergeLocalEditOp('Ma', 'Mad', 'MaMa').text).toBe('MadMa');
});

test('remote text changes are recorded per window and chained for the editor', () => {
  resetTextEdits();
  const remote = new Y.Doc();
  const local = new Y.Doc();
  const root = local.getMap('canvas');
  root.observeDeep((events, tr) => collectTextEvents(events, tr.origin === 'local'));
  const win = new Y.Map();
  remote.getMap('canvas').set('windows', new Y.Map());
  remote.getMap('canvas').get('windows').set('w1', win);
  win.set('text', new Y.Text('Ma'));
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote), 'remote');
  recordRemoteText([], [{ id: 'w1', text: 'Ma' }]);
  const send = (fn) => { const sv = Y.encodeStateVector(local); fn(); Y.applyUpdate(local, Y.encodeStateAsUpdate(remote, sv), 'remote'); };
  send(() => win.get('text').insert(0, 'Ma'));
  recordRemoteText([{ id: 'w1', text: 'Ma' }], [{ id: 'w1', text: 'MaMa' }]);
  send(() => win.get('text').insert(2, 'd'));
  recordRemoteText([{ id: 'w1', text: 'MaMa' }], [{ id: 'w1', text: 'MadMa' }]);
  expect(remoteOps('w1', 'text', 'Ma', 'MadMa')).toEqual([{ index: 0, remove: 0, insert: 'Ma' }, { index: 2, remove: 0, insert: 'd' }]);
  expect(remoteOps('w1', 'text', 'Ma', 'something else')).toBe(null);
  expect(remoteOps('w2', 'text', 'Ma', 'MaMa')).toBe(null);
  noteLocalEdit('w1', 'text', 'MaMad', { index: 4, remove: 0, insert: 'd' });
  expect(takeLocalEdit('w1', 'text', 'other')).toBe(null);
  noteLocalEdit('w1', 'text', 'MaMad', { index: 4, remove: 0, insert: 'd' });
  expect(takeLocalEdit('w1', 'text', 'MaMad')).toEqual({ index: 4, remove: 0, insert: 'd' });
});

test('a Vault note\'s words, in a field of their own, are recorded the same way', () => {
  resetTextEdits();
  const remote = new Y.Doc();
  const local = new Y.Doc();
  local.getMap('canvas').observeDeep((events, tr) => collectTextEvents(events, tr.origin === 'local'));
  const win = new Y.Map();
  remote.getMap('canvas').set('windows', new Y.Map());
  remote.getMap('canvas').get('windows').set('v1', win);
  win.set('vt.note-a', new Y.Text('Ma'));
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote), 'remote');
  const sv = Y.encodeStateVector(local);
  win.get('vt.note-a').insert(0, 'Ma');
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote, sv), 'remote');
  recordRemoteText([{ id: 'v1', 'vt.note-a': 'Ma' }], [{ id: 'v1', 'vt.note-a': 'MaMa' }]);
  expect(remoteOps('v1', 'vt.note-a', 'Ma', 'MaMa')).toEqual([{ index: 0, remove: 0, insert: 'Ma' }]);
});
