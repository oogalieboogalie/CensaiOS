import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

// The Listing Writer's form merges box by box, and the words inside each box
// letter by letter: Pat and Sam filling in one listing at the same moment
// both keep what they typed. All words are made up.
const LOCAL = 'local';
const FORM = { address: '14 Made-up Way', city: 'Exampleton', beds: '3', baths: '2', sqft: '1500', price: '400,000', features: 'Fenced yard', photos: [] };
const board = (listing) => ({ wins: [{ id: 'l1', kind: 'listingWriter', x: 0, y: 0, w: 640, h: 560, listing }] });

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

const formOf = (doc, base) => readDocState(doc, base).wins[0].listing;

function startBoth(form = FORM) {
  const pair = offlinePair();
  const base = board(form);
  writeStateToDoc(pair.a, null, base, LOCAL);
  pair.sync();
  return { ...pair, base };
}

test('Pat types the features while Sam fixes the price: both changes stay', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ ...FORM, features: 'Fenced yard, new roof' }), LOCAL);
  writeStateToDoc(b, base, board({ ...FORM, price: '415,000' }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const form = formOf(doc, base);
    expect([form.features, form.price]).toEqual(['Fenced yard, new roof', '415,000']);
  }
});

test('two people typing in the same box keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ ...FORM, features: 'Sunny porch. Fenced yard' }), LOCAL);
  writeStateToDoc(b, base, board({ ...FORM, features: 'Fenced yard, two-car garage' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(formOf(doc, base).features).toBe('Sunny porch. Fenced yard, two-car garage');
});

test('a form saved whole by an older board still merges after its first edit', () => {
  const { a, b, sync, base } = startBoth();
  // An older board saved the form as one plain value, its words plain text.
  a.getMap('canvas').get('windows').get('l1').set('listing', new Y.Map(Object.entries({ ...FORM, photos: undefined }).filter(([, v]) => v !== undefined)));
  sync();
  const plain = { ...FORM };
  delete plain.photos;
  const one = board({ ...plain, features: 'Fenced yard, big kitchen' });
  writeStateToDoc(a, board(plain), one, LOCAL);
  sync();
  writeStateToDoc(a, one, board({ ...plain, features: 'Pat: Fenced yard, big kitchen' }), LOCAL);
  writeStateToDoc(b, one, board({ ...plain, features: 'Fenced yard, big kitchen. Sam' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(formOf(doc, base).features).toBe('Pat: Fenced yard, big kitchen. Sam');
});

test('photos and numbers still save, and a cleared form stays cleared', () => {
  const { a, b, sync, base } = startBoth();
  const next = { ...FORM, beds: 4, photos: [{ name: 'made-up-front.jpg' }] };
  writeStateToDoc(a, base, board(next), LOCAL);
  sync();
  expect(formOf(b, base)).toEqual(next);
  writeStateToDoc(a, board(next), board(null), LOCAL);
  sync();
  expect(formOf(b, base)).toBeNull();
});

test('a listing opened empty: Pat and Sam typing in different boxes first both stay', () => {
  const { a, b, sync, base } = startBoth(null);
  writeStateToDoc(a, base, board({ address: '14 Made-up Way' }), LOCAL);
  sync();
  // Sam's screen has not caught up yet: his copy still has no listing.
  writeStateToDoc(b, base, board({ price: '415,000' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(formOf(doc, base)).toEqual({ address: '14 Made-up Way', price: '415,000' });
});
