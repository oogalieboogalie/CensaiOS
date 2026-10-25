import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { setListMergeReporter } from '../src/lib/collaboration/windowLists.js';
import { keepUnsavedIdeas } from '../src/components/idea/ideaUtils.js';

const LOCAL = 'local';
const todo = (id, text, extra = {}) => ({ id, text, done: false, assignee: null, ...extra });
const list = (items) => ({ wins: [{ id: 't1', kind: 'todos', x: 0, y: 0, w: 300, h: 400, items }] });

// Both browsers edit while apart, then exchange updates (the worst case).
function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

const itemsOf = (doc, base) => readDocState(doc, base).wins[0].items;

describe('To-do lists merge one to-do at a time', () => {
  afterEach(() => setListMergeReporter(null));

  test('two people adding a to-do at the same moment both keep both', () => {
    const { a, b, sync } = offlinePair();
    const base = list([todo(1, 'Order signs')]);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, list([todo(1, 'Order signs'), todo(2, 'Call Jordan')]), LOCAL);
    writeStateToDoc(b, base, list([todo(1, 'Order signs'), todo(3, 'Email Pat')]), LOCAL);
    sync();
    for (const doc of [a, b]) {
      expect(itemsOf(doc, base).map((t) => t.text).sort()).toEqual(['Call Jordan', 'Email Pat', 'Order signs']);
    }
  });

  test('ticking one to-do while someone adds another keeps both changes', () => {
    const { a, b, sync } = offlinePair();
    const base = list([todo(1, 'Order signs'), todo(2, 'Call Jordan')]);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, list([todo(1, 'Order signs', { done: true }), todo(2, 'Call Jordan')]), LOCAL);
    writeStateToDoc(b, base, list([todo(1, 'Order signs'), todo(2, 'Call Jordan'), todo(4, 'Book Mo')]), LOCAL);
    sync();
    const items = itemsOf(a, base);
    expect(items.find((t) => t.id === 1).done).toBe(true);
    expect(items.map((t) => t.id)).toEqual([1, 2, 4]);
    expect(itemsOf(b, base)).toEqual(items);
  });

  test('removing a to-do removes only that one', () => {
    const { a, b, sync } = offlinePair();
    const base = list([todo(1, 'Order signs'), todo(2, 'Call Jordan')]);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, list([todo(2, 'Call Jordan')]), LOCAL);
    writeStateToDoc(b, base, list([todo(1, 'Order signs'), todo(2, 'Call Jordan'), todo(5, 'Pay Pat')]), LOCAL);
    sync();
    expect(itemsOf(a, base).map((t) => t.id)).toEqual([2, 5]);
    expect(itemsOf(b, base).map((t) => t.id)).toEqual([2, 5]);
  });

  test('a write that keeps someone else\'s to-do is reported once for the log', () => {
    const { a, b, sync } = offlinePair();
    const base = list([todo(1, 'Order signs')]);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(b, base, list([todo(1, 'Order signs'), todo(3, 'Email Pat')]), LOCAL);
    sync();
    const reports = [];
    setListMergeReporter((info) => reports.push(info));
    writeStateToDoc(a, base, list([todo(1, 'Order signs'), todo(2, 'Call Jordan')]), LOCAL);
    expect(reports).toEqual([{ field: 'items', kept: 1 }]);
    expect(itemsOf(a, base).map((t) => t.id)).toEqual([1, 3, 2]);
  });

  test('lists without ids still save as one piece', () => {
    const { a } = offlinePair();
    const base = list([{ text: 'one' }]);
    writeStateToDoc(a, null, base, LOCAL);
    writeStateToDoc(a, base, list([{ text: 'one' }, { text: 'two' }]), LOCAL);
    expect(itemsOf(a, base)).toEqual([{ text: 'one' }, { text: 'two' }]);
  });
});

const pad = (ideas) => ({ wins: [{ id: 'i1', kind: 'idea', x: 0, y: 0, w: 300, h: 400, ideas }] });
const ideasOf = (doc, base) => readDocState(doc, base).wins[0].ideas;

describe('Idea Pad bullets merge one bullet at a time', () => {
  afterEach(() => setListMergeReporter(null));

  test('Alma and Sam adding a bullet at the same moment both keep both', () => {
    const { a, b, sync } = offlinePair();
    const base = pad(['New sign for the shop']);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, pad(['New sign for the shop', 'Ask Jordan about prices']), LOCAL);
    writeStateToDoc(b, base, pad(['New sign for the shop', 'Open on Sundays']), LOCAL);
    sync();
    for (const doc of [a, b]) {
      expect(ideasOf(doc, base).sort()).toEqual(['Ask Jordan about prices', 'New sign for the shop', 'Open on Sundays']);
    }
  });

  test('editing one bullet while someone adds another keeps both changes', () => {
    const { a, b, sync } = offlinePair();
    const base = pad(['Sign', 'Prices']);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(a, base, pad(['Bigger sign', 'Prices']), LOCAL);
    writeStateToDoc(b, base, pad(['Sign', 'Prices', 'Hours']), LOCAL);
    sync();
    expect(ideasOf(a, base)).toEqual(['Bigger sign', 'Prices', 'Hours']);
    expect(ideasOf(b, base)).toEqual(ideasOf(a, base));
  });

  test('two identical bullets stay two, and removing one leaves the other', () => {
    const { a } = offlinePair();
    const base = pad(['Call Mo', 'Call Mo']);
    writeStateToDoc(a, null, base, LOCAL);
    writeStateToDoc(a, base, pad(['Call Mo']), LOCAL);
    expect(ideasOf(a, base)).toEqual(['Call Mo']);
  });

  test('a merge of bullets is reported for the app log', () => {
    const { a, b, sync } = offlinePair();
    const base = pad(['Sign']);
    writeStateToDoc(a, null, base, LOCAL);
    sync();
    writeStateToDoc(b, base, pad(['Sign', 'Hours']), LOCAL);
    sync();
    const reports = [];
    setListMergeReporter((info) => reports.push(info));
    writeStateToDoc(a, base, pad(['Sign', 'Prices']), LOCAL);
    expect(reports).toEqual([{ field: 'ideas', kept: 1 }]);
  });

  test('a bullet typed but not yet saved survives a teammate\'s save arriving', () => {
    expect(keepUnsavedIdeas(['Sign', 'Hours'], ['Sign', 'Prices'], ['Sign'])).toEqual(['Sign', 'Hours', 'Prices']);
    expect(keepUnsavedIdeas(['Sign'], ['Sign'], ['Sign'])).toEqual(['Sign']);
    // Removed by the teammate and not touched here: stays removed.
    expect(keepUnsavedIdeas([], ['Sign'], ['Sign'])).toEqual([]);
  });
});
