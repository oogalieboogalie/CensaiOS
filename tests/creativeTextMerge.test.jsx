/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { cleanup, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { readPhoto } from '../src/lib/creative/photoModel.js';
import { readVideo } from '../src/lib/creative/videoModel.js';
import { ClipInspector } from '../src/components/creative/video/ClipInspector.jsx';

// A Censai Photo text layer and a Censai Video title merge letter by letter:
// Pat and Sam typing in one at the same moment both keep their words, and one
// person typing while the other drags, recolours or resizes keeps both
// changes. Before, the whole layer or clip was one value, so the last person
// to touch it wiped the other's change. All words are made up.
const LOCAL = 'local';
const LAYER = { kind: 'text', name: 'Headline', x: 40, y: 40, visible: true, opacity: 1, blend: 'source-over', adj: {}, text: 'Bake sale', size: 64, color: 'ink', weight: 600, at: 1 };
const CLIP = { track: 't', start: 0, dur: 3, in: 0, volume: 1, text: 'Bake sale', size: 72, color: 'ink', pos: 'center', at: 1 };
const photo = (layer) => ({ wins: [{ id: 'p1', kind: 'creativePhoto', x: 0, y: 0, w: 800, h: 600, photoDoc: { w: 1200, h: 800, order: ['l1'] }, 'pl.l1': layer }] });
const video = (clip) => ({ wins: [{ id: 'v1', kind: 'creativeVideo', x: 0, y: 0, w: 800, h: 600, videoDoc: { w: 1280, h: 720 }, 'vc.c1': clip }] });

function startBoth(base) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync };
}

const layerOf = (doc, base) => readPhoto(readDocState(doc, base).wins[0]).layers.l1;
const clipOf = (doc, base) => readVideo(readDocState(doc, base).wins[0]).clips.c1;

afterEach(cleanup);

test('Photo: Pat and Sam typing in one text layer keep both their words', () => {
  const base = photo(LAYER);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, photo({ ...LAYER, text: 'Big bake sale' }), LOCAL);
  writeStateToDoc(b, base, photo({ ...LAYER, text: 'Bake sale Saturday' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(layerOf(doc, base).text).toBe('Big bake sale Saturday');
});

test('Photo: Pat types while Sam drags and recolours the layer; all three stay', () => {
  const base = photo(LAYER);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, photo({ ...LAYER, text: 'Bake sale!' }), LOCAL);
  writeStateToDoc(b, base, photo({ ...LAYER, x: 300, color: 'accent' }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const l = layerOf(doc, base);
    expect([l.text, l.x, l.color, l.kind]).toEqual(['Bake sale!', 300, 'accent', 'text']);
  }
});

test('Photo: two people renaming one layer keep both their words', () => {
  const base = photo(LAYER);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, photo({ ...LAYER, name: 'Big Headline' }), LOCAL);
  writeStateToDoc(b, base, photo({ ...LAYER, name: 'Headline 2' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(layerOf(doc, base).name).toBe('Big Headline 2');
});

test('Photo: a removed layer stays removed on both screens', () => {
  const base = photo(LAYER);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, { wins: [{ ...photo(null).wins[0], photoDoc: { w: 1200, h: 800, order: [] } }] }, LOCAL);
  sync();
  expect(layerOf(b, base)).toBeUndefined();
});

test('Video: Pat and Sam typing in one title keep both their words', () => {
  const base = video(CLIP);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, video({ ...CLIP, text: 'Big bake sale' }), LOCAL);
  writeStateToDoc(b, base, video({ ...CLIP, text: 'Bake sale at noon' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(clipOf(doc, base).text).toBe('Big bake sale at noon');
});

test('Video: Pat types a title while Sam trims and moves the clip; both stay', () => {
  const base = video(CLIP);
  const { a, b, sync } = startBoth(base);
  writeStateToDoc(a, base, video({ ...CLIP, text: 'Bake sale today' }), LOCAL);
  writeStateToDoc(b, base, video({ ...CLIP, start: 2, dur: 5 }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const c = clipOf(doc, base);
    expect([c.text, c.start, c.dur]).toEqual(['Bake sale today', 2, 5]);
  }
});

test('Video: a title saved whole by an older board still merges after its first edit', () => {
  const base = video(CLIP);
  const { a, b, sync } = startBoth(base);
  // An older board saved the clip as one plain map, its words plain text.
  a.getMap('canvas').get('windows').get('v1').set('vc.c1', new Y.Map(Object.entries(CLIP)));
  sync();
  const one = video({ ...CLIP, text: 'Bake sale, Saturday' });
  writeStateToDoc(a, base, one, LOCAL);
  sync();
  writeStateToDoc(a, one, video({ ...CLIP, text: 'Pat: Bake sale, Saturday' }), LOCAL);
  writeStateToDoc(b, one, video({ ...CLIP, text: 'Bake sale, Saturday. Sam' }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(clipOf(doc, base).text).toBe('Pat: Bake sale, Saturday. Sam');
});

test('Video: a teammate typing before your cursor in a title keeps your cursor in place', () => {
  const noop = () => {};
  const { rerender } = render(<ClipInspector clip={CLIP} onChange={noop} />);
  const box = screen.getByLabelText('Title text');
  box.focus();
  box.setSelectionRange('Bake'.length, 'Bake'.length);
  rerender(<ClipInspector clip={{ ...CLIP, text: 'Big Bake sale' }} onChange={noop} />);
  expect(box.value).toBe('Big Bake sale');
  expect(box.value.slice(0, box.selectionStart)).toBe('Big Bake');
});
