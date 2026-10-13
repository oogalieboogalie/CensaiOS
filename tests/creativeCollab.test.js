// Censai Creative files keep each layer, shape and clip in its own window
// field, so two people working on different pieces at once both keep their
// work after the CRDT sync.
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { addLayerPatch, layerKey, makeLayer, readPhoto } from '../src/lib/creative/photoModel.js';
import { addShapesPatch, makeShape, readVector, shapeKey } from '../src/lib/creative/vectorModel.js';
import { moveShape } from '../src/lib/creative/vectorGeom.js';
import { addClipPatch, clipKey, makeClip, readVideo, trimClip } from '../src/lib/creative/videoModel.js';
import { CREATIVE_STARTERS } from '../src/lib/creative/creativeStarters.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

const frame = { id: 'w1', x: 0, y: 0, w: 800, h: 600 };

function pair(win) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = { wins: [{ ...frame, ...win }] };
  writeStateToDoc(a, null, base, 'local');
  sync();
  const edit = (doc, patch) => writeStateToDoc(doc, base, { wins: [{ ...base.wins[0], ...patch }] }, 'local');
  const read = (doc) => readDocState(doc).wins[0];
  return { a, b, sync, edit, read };
}

describe('Censai Creative merges edits from two people', () => {
  test('Photo: one person paints layer 1 while the other adds a text layer', () => {
    const start = { kind: 'creativePhoto', ...CREATIVE_STARTERS.creativePhoto };
    const { a, b, sync, edit, read } = pair(start);
    const painted = { ...start[layerKey('l1')], src: 'data:image/png;base64,AAAA' };
    edit(a, { [layerKey('l1')]: painted });
    edit(b, addLayerPatch(readPhoto(start), makeLayer('text', { text: 'Sale' })).patch);
    sync();
    for (const doc of [a, b]) {
      const photo = readPhoto(read(doc));
      expect(photo.order).toHaveLength(2);
      expect(photo.layers.l1.src).toBe('data:image/png;base64,AAAA');
      expect(Object.values(photo.layers).some((l) => l.text === 'Sale')).toBe(true);
    }
  });

  test('Vector: two people each draw a shape and move a different one', () => {
    const seed = addShapesPatch(readVector(CREATIVE_STARTERS.creativeVector), [makeShape('rect', { x: 0, y: 0, w: 10, h: 10 }), makeShape('ellipse', { x: 50, y: 0, w: 10, h: 10 })]);
    const start = { kind: 'creativeVector', ...CREATIVE_STARTERS.creativeVector, ...seed.patch };
    const { a, b, sync, edit, read } = pair(start);
    const [r, e] = seed.ids;
    edit(a, { ...addShapesPatch(readVector(start), [makeShape('text', { text: 'Alex' })]).patch, [shapeKey(r)]: moveShape(start[shapeKey(r)], 5, 5) });
    edit(b, { ...addShapesPatch(readVector(start), [makeShape('line', { x1: 0, y1: 0, x2: 9, y2: 9 })]).patch, [shapeKey(e)]: moveShape(start[shapeKey(e)], 0, 40) });
    sync();
    const va = readVector(read(a));
    expect(va.order).toEqual(readVector(read(b)).order);
    expect(va.order).toHaveLength(4);
    expect(va.shapes[r].x).toBe(5);
    expect(va.shapes[e].y).toBe(40);
  });

  test('Video: one person trims a clip while the other adds a title', () => {
    const clip = addClipPatch(makeClip('v', { dur: 6, media: { id: 'm1', kind: 'video', name: 'beach', dur: 8 } }));
    const start = { kind: 'creativeVideo', ...CREATIVE_STARTERS.creativeVideo, ...clip.patch };
    const { a, b, sync, edit, read } = pair(start);
    edit(a, { [clipKey(clip.id)]: trimClip(start[clipKey(clip.id)], 'out', 3) });
    edit(b, addClipPatch(makeClip('t', { start: 1, text: 'Day one' })).patch);
    sync();
    for (const doc of [a, b]) {
      const v = readVideo(read(doc));
      expect(v.ids).toHaveLength(2);
      expect(v.clips[clip.id].dur).toBe(3);
      expect(Object.values(v.clips).some((c) => c.text === 'Day one')).toBe(true);
    }
  });

  test('Photo, Vector and Video sit together under Censai Creative in the Add palette', () => {
    const sections = buildAddSections({ manifests: WINDOW_MANIFESTS.filter((m) => m.moduleMenu?.show !== false) });
    const creative = sections.find((s) => s.label === 'Censai Creative');
    expect(creative.items.map((i) => i.label)).toEqual(['Photo', 'Vector', 'Video']);
  });
});
