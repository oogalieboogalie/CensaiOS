/**
 * @jest-environment jsdom
 */
// Censai Creative models: the pure parts of Photo, Vector and Video.
import {
  addLayerPatch, cropPatch, filterString, isBlank, makePhotoDoc, moveLayerPatch, readPhoto, removeLayerPatch, makeLayer,
} from '../src/lib/creative/photoModel.js';
import { pathD, shapeBox, toPath, transformShape } from '../src/lib/creative/vectorGeom.js';
import {
  addShapesPatch, alignPatch, distributePatch, expandGroups, groupPatch, makeShape, makeVectorDoc, readVector, reorderPatch,
} from '../src/lib/creative/vectorModel.js';
import { vectorToSvg } from '../src/lib/creative/svgOut.js';
import { importSvg, parseTransform } from '../src/lib/creative/svgIn.js';
import { parsePathData } from '../src/lib/creative/svgPathParse.js';
import {
  activeClip, addClipPatch, clipKey, duration, makeClip, makeVideoDoc, readVideo, snap, splitPatch, titleAlpha, trimClip,
} from '../src/lib/creative/videoModel.js';

const apply = (win, patch) => ({ ...win, ...patch });
const near = (a, b, d = 0.01) => expect(Math.abs(a - b)).toBeLessThan(d);

describe('Censai Photo model', () => {
  test('layers add, reorder and remove; crop shifts layers instead of re-encoding pixels', () => {
    let win = makePhotoDoc({ w: 800, h: 600 });
    expect(isBlank(readPhoto(win))).toBe(true);
    const { id, patch } = addLayerPatch(readPhoto(win), makeLayer('text', { x: 100, y: 50 }));
    win = apply(win, patch);
    expect(readPhoto(win).order).toEqual(['l1', id]);
    expect(isBlank(readPhoto(win))).toBe(false);
    win = apply(win, moveLayerPatch(readPhoto(win), id, -1));
    expect(readPhoto(win).order).toEqual([id, 'l1']);
    win = apply(win, cropPatch(readPhoto(win), { x: 300, y: 200, w: -200, h: -100 }));
    const doc = readPhoto(win);
    expect([doc.w, doc.h]).toEqual([200, 100]);
    expect([doc.layers[id].x, doc.layers[id].y]).toEqual([0, -50]);
    win = apply(win, removeLayerPatch(readPhoto(win), id));
    expect(readPhoto(win).order).toEqual(['l1']);
  });

  test('adjustments become one canvas filter, and neutral is none', () => {
    expect(filterString({})).toBe('none');
    expect(filterString({ brightness: 20, contrast: -10, hue: 90, blur: 2, grayscale: 100 }))
      .toBe('brightness(120%) contrast(90%) hue-rotate(90deg) grayscale(100%) blur(2px)');
  });
});

describe('Censai Vector geometry', () => {
  test('rectangles and ellipses turn into editable paths with the same box', () => {
    const r = toPath({ type: 'rect', x: 10, y: 20, w: 100, h: 50, rx: 10 });
    const b = shapeBox(r);
    near(b.x, 10); near(b.y, 20); near(b.w, 100); near(b.h, 50);
    const e = shapeBox(toPath({ type: 'ellipse', x: 0, y: 0, w: 200, h: 100 }));
    near(e.w, 200, 0.5); near(e.h, 100, 0.5);
    expect(pathD(toPath({ type: 'line', x1: 0, y1: 0, x2: 5, y2: 5 }))).toBe('M0 0 L5 5');
  });

  test('resizing maps every point into the new box', () => {
    const p = { type: 'path', subpaths: [{ pts: [{ x: 0, y: 0, ix: 0, iy: 0, ox: 10, oy: 0 }, { x: 10, y: 10, ix: 10, iy: 0, ox: 10, oy: 10 }], closed: false }] };
    const out = transformShape(p, { x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 100, w: 20, h: 40 });
    expect(out.subpaths[0].pts[1]).toEqual({ x: 120, y: 140, ix: 120, iy: 100, ox: 120, oy: 140 });
  });

  test('align, distribute, groups and stacking order', () => {
    let win = makeVectorDoc({ w: 400, h: 300 });
    const shapes = [0, 50, 300].map((x) => makeShape('rect', { x, y: x / 10, w: 20, h: 20 }));
    const { ids, patch } = addShapesPatch(readVector(win), shapes);
    win = apply(win, patch);
    win = apply(win, alignPatch(readVector(win), ids, 'top'));
    expect(ids.map((id) => readVector(win).shapes[id].y)).toEqual([0, 0, 0]);
    win = apply(win, distributePatch(readVector(win), ids, 'h'));
    expect(ids.map((id) => readVector(win).shapes[id].x)).toEqual([0, 150, 300]);
    win = apply(win, groupPatch(readVector(win), ids.slice(0, 2)));
    expect(expandGroups(readVector(win), [ids[0]])).toEqual(ids.slice(0, 2));
    // Clicking one member selects the group; one piece aligns to the artboard and moves as a whole.
    win = apply(win, alignPatch(readVector(win), expandGroups(readVector(win), [ids[1]]), 'right'));
    const doc = readVector(win);
    expect(doc.shapes[ids[1]].x + 20).toBe(400);
    expect(doc.shapes[ids[0]].x).toBe(400 - 20 - 150);
    win = apply(win, reorderPatch(doc, [ids[2]], false));
    expect(readVector(win).order[0]).toBe(ids[2]);
  });

  test('SVG export writes groups and round-trips through import', () => {
    let win = makeVectorDoc({ w: 200, h: 100 });
    const { ids, patch } = addShapesPatch(readVector(win), [
      makeShape('rect', { x: 10, y: 10, w: 50, h: 30, fill: '#ff0000' }),
      makeShape('ellipse', { x: 100, y: 10, w: 40, h: 40 }),
      makeShape('text', { x: 10, y: 60, text: 'Hi <you>', size: 20 }),
    ]);
    win = apply(win, patch);
    win = apply(win, groupPatch(readVector(win), ids.slice(0, 2)));
    const svg = vectorToSvg(readVector(win));
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="200" height="100"/);
    expect(svg).toContain('<g id=');
    expect(svg).toContain('Hi &lt;you&gt;');
    const back = importSvg(svg, new DOMParser(), () => 'g1');
    expect([back.w, back.h]).toEqual([200, 100]);
    // Background rect + rect + ellipse as paths, then the text.
    expect(back.shapes.map((s) => s.type)).toEqual(['path', 'path', 'path', 'text']);
    expect(back.shapes[1].group).toBe('g1');
    const rect = shapeBox(back.shapes[1]);
    near(rect.x, 10); near(rect.w, 50);
    expect(back.shapes[1].fill).toBe('#ff0000');
    expect(back.shapes[3].text).toBe('Hi <you>');
  });
});

describe('SVG import', () => {
  test('path commands, arcs, transforms and gradients', () => {
    const subs = parsePathData('M10 10 h20 v20 H10 z m40 0 q10 -10 20 0 t20 0 A10 10 0 0 1 90 30');
    expect(subs).toHaveLength(2);
    expect(subs[0].closed).toBe(true);
    expect(subs[0].pts.map((p) => [p.x, p.y])).toEqual([[10, 10], [30, 10], [30, 30], [10, 30]]);
    const last = subs[1].pts[subs[1].pts.length - 1];
    near(last.x, 90); near(last.y, 30);
    expect(parseTransform('translate(10 20) scale(2)')).toEqual([2, 0, 0, 2, 10, 20]);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><linearGradient id="g"><stop offset="0" stop-color="#00ff00"/></linearGradient></defs>
      <g transform="translate(10,10)" fill="#123456"><circle cx="10" cy="10" r="10"/><rect x="30" y="0" width="10" height="10" fill="url(#g)" style="stroke:#000;stroke-width:2"/></g>
    </svg>`;
    const out = importSvg(svg, new DOMParser(), () => 'grp');
    expect(out.shapes).toHaveLength(2);
    const circle = shapeBox(out.shapes[0]);
    near(circle.x, 10, 0.1); near(circle.w, 20, 0.1);
    expect(out.shapes[0].fill).toBe('#123456');
    expect(out.shapes[1]).toMatchObject({ fill: '#00ff00', stroke: '#000', sw: 2, group: 'grp' });
    expect(() => importSvg('<html></html>', new DOMParser())).toThrow(/not an SVG/);
  });
});

describe('Censai Video model', () => {
  const docWith = (clips) => {
    let win = makeVideoDoc();
    const ids = clips.map((c) => { const { id, patch } = addClipPatch(c); win = apply(win, patch); return id; });
    return { win, ids, doc: readVideo(win) };
  };

  test('split cuts one clip into two that play the same footage', () => {
    const media = { id: 'm1', kind: 'video', name: 'beach', dur: 10 };
    const { win, ids, doc } = docWith([makeClip('v', { start: 2, dur: 6, in: 1, media })]);
    const { id, patch } = splitPatch(doc, ids[0], 5);
    const next = readVideo(apply(win, patch));
    expect(next.clips[ids[0]]).toMatchObject({ start: 2, dur: 3, in: 1 });
    expect(next.clips[id]).toMatchObject({ start: 5, dur: 3, in: 4 });
    expect(duration(next)).toBe(8);
    expect(activeClip(next, 'v', 5.5)).toBe(id);
    expect(splitPatch(next, id, 5.01)).toBeNull();
  });

  test('trimming stops at the ends of the source file; pictures stretch freely', () => {
    const v = makeClip('v', { start: 2, dur: 4, in: 1, media: { id: 'm', kind: 'video', dur: 6 } });
    expect(trimClip(v, 'in', 0)).toMatchObject({ start: 1, in: 0, dur: 5 });
    expect(trimClip(v, 'out', 20)).toMatchObject({ dur: 5 });
    expect(trimClip(v, 'in', 5.99).dur).toBeCloseTo(0.1);
    const pic = makeClip('v', { start: 0, dur: 4, media: { kind: 'image', src: 'data:' } });
    expect(trimClip(pic, 'out', 30).dur).toBe(30);
  });

  test('snapping, title fades and clip keys', () => {
    expect(snap(4.93, [0, 5, 10], 0.1)).toBe(5);
    expect(snap(4.5, [0, 5, 10], 0.1)).toBe(4.5);
    const title = makeClip('t', { start: 0, dur: 3 });
    expect(titleAlpha(title, 0)).toBe(0);
    expect(titleAlpha(title, 1.5)).toBe(1);
    expect(clipKey('c1')).toBe('vc.c1');
  });
});

describe('WebM duration patch', () => {
  test('adds a Duration to a recorded file that has none, and leaves others alone', async () => {
    const { patchWebmDuration } = await import('../src/lib/creative/webmDuration.js');
    // EBML header stub, Segment (unknown size), Info with TimecodeScale only, then a Cluster.
    const info = [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40];
    const bytes = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0x15, 0x49, 0xa9, 0x66, 0x80 | info.length, ...info, 0x1f, 0x43, 0xb6, 0x75]);
    const out = patchWebmDuration(bytes, 10221);
    expect(out.length).toBe(bytes.length + 11);
    expect(out[21]).toBe(0x80 | (info.length + 11));
    const at = 22 + info.length;
    expect([...out.subarray(at, at + 3)]).toEqual([0x44, 0x89, 0x88]);
    expect(new DataView(out.buffer).getFloat64(at + 3)).toBe(10221);
    expect([...out.subarray(out.length - 4)]).toEqual([0x1f, 0x43, 0xb6, 0x75]);
    expect(patchWebmDuration(out, 5)).toBe(out);
  });
});
