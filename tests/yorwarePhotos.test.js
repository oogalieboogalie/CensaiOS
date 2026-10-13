// YorWare Photos (spec 13): photos, ratings and develop settings live in
// their own board fields so two people's changes merge; the develop math,
// raw-file picture finder and library filters are plain functions.
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import {
  MAX_PHOTOS, addPhotosPatch, editPatch, isEdited, normalizeEdits, outputSize, pasteEditsPatch, ratingPatch, readLibrary,
  removePhotosPatch, rotatePatch,
} from '../src/lib/yorware/photoLibModel.js';
import { adjustPixels, autoEdits, buildLuts, histogram } from '../src/lib/yorware/photoAdjust.js';
import { findEmbeddedJpegs, isRawName, orientationToRot, walkJpeg } from '../src/lib/yorware/photoRaw.js';
import { allTags, shotLine, visiblePhotos } from '../src/lib/yorware/photoFilter.js';
import { metaFromExif } from '../src/lib/yorware/photoImport.js';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

const item = (name, meta = {}) => ({ name, src: 'data:image/jpeg;base64,AA', thumb: 'data:image/jpeg;base64,AA', w: 400, h: 300, meta });
function libWith(...names) {
  const start = { kind: 'yorPhotos', ...YORWARE_STARTERS.yorPhotos };
  const { patch } = addPhotosPatch(readLibrary(start), names.map((n) => (typeof n === 'string' ? item(n) : n)));
  return { ...start, ...patch };
}
const apply = (win, patch) => ({ ...win, ...patch });

describe('YorWare Photos board model', () => {
  test('adding photos appends them, each with empty rating and edits', () => {
    const win = libWith('a.jpg', 'b.jpg');
    const lib = readLibrary(win);
    expect(lib.order).toHaveLength(2);
    expect(lib.photos[lib.order[1]].name).toBe('b.jpg');
    expect(lib.ratings[lib.order[0]]).toEqual({ stars: 0, flag: null, tags: [] });
    expect(isEdited(lib.edits[lib.order[0]])).toBe(false);
  });

  test('the library stops at the photo limit', () => {
    const full = libWith(...Array.from({ length: MAX_PHOTOS - 1 }, (_, i) => `p${i}.jpg`));
    const { ids, skipped } = addPhotosPatch(readLibrary(full), [item('x.jpg'), item('y.jpg')]);
    expect(ids).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  test('ratings and edits are kept in range', () => {
    let win = libWith('a.jpg');
    const [id] = readLibrary(win).order;
    win = apply(win, ratingPatch(readLibrary(win), id, { stars: 9, flag: 'nope', tags: [' Beach ', 'beach', ''] }));
    expect(readLibrary(win).ratings[id]).toEqual({ stars: 5, flag: null, tags: ['beach'] });
    win = apply(win, editPatch(readLibrary(win), id, { exposure: 7, rot: 450, crop: { x: 0, y: 0, w: 1, h: 1 } }));
    expect(readLibrary(win).edits[id]).toMatchObject({ exposure: 3, rot: 90, crop: null });
  });

  test('turning keeps the crop on the same part of the picture', () => {
    let win = libWith('a.jpg');
    const [id] = readLibrary(win).order;
    win = apply(win, editPatch(readLibrary(win), id, { crop: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }));
    win = apply(win, rotatePatch(readLibrary(win), id, 1));
    const e = readLibrary(win).edits[id];
    expect(e.rot).toBe(90);
    expect(e.crop.x).toBeCloseTo(0.4);
    expect(e.crop.y).toBeCloseTo(0.1);
    expect(outputSize({ w: 400, h: 300 }, e)).toEqual({ w: 120, h: 120 });
    win = apply(win, rotatePatch(readLibrary(win), id, -1));
    expect(readLibrary(win).edits[id].crop.x).toBeCloseTo(0.1);
  });

  test('pasting a look copies the sliders but not the crop or turn', () => {
    let win = libWith('a.jpg', 'b.jpg');
    const [a, b] = readLibrary(win).order;
    win = apply(win, editPatch(readLibrary(win), a, { exposure: 1, temp: 30, rot: 90, crop: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 } }));
    win = apply(win, pasteEditsPatch(readLibrary(win), a, [a, b]));
    expect(readLibrary(win).edits[b]).toMatchObject({ exposure: 1, temp: 30, rot: 0, crop: null });
  });

  test('removing photos removes their ratings and edits', () => {
    let win = libWith('a.jpg', 'b.jpg');
    const [a, b] = readLibrary(win).order;
    win = apply(win, ratingPatch(readLibrary(win), a, { stars: 3 }));
    win = apply(win, removePhotosPatch(readLibrary(win), [a]));
    expect(readLibrary(win).order).toEqual([b]);
    expect(win[`pr.${a}`]).toBeNull();
  });

  test('two people rating and developing the same photo at once both keep their change', () => {
    const start = libWith('a.jpg', 'b.jpg');
    const [a, b] = readLibrary(start).order;
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)), 'remote');
      Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)), 'remote');
    };
    const base = { wins: [{ id: 'w1', x: 0, y: 0, w: 1100, h: 700, ...start }] };
    writeStateToDoc(docA, null, base, 'local');
    sync();
    const edit = (d, patch) => writeStateToDoc(d, base, { wins: [{ ...base.wins[0], ...patch }] }, 'local');
    edit(docA, ratingPatch(readLibrary(start), a, { stars: 4, flag: 'pick' }));
    edit(docB, { ...editPatch(readLibrary(start), a, { exposure: 0.5 }), ...ratingPatch(readLibrary(start), b, { tags: ['beach'] }) });
    sync();
    for (const d of [docA, docB]) {
      const lib = readLibrary(readDocState(d).wins[0]);
      expect(lib.ratings[a]).toMatchObject({ stars: 4, flag: 'pick' });
      expect(lib.edits[a].exposure).toBe(0.5);
      expect(lib.ratings[b].tags).toEqual(['beach']);
    }
  });
});

describe('YorWare Photos develop math', () => {
  const grey = (v, n = 16) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? 255 : v));

  test('no settings leaves every pixel as it was', () => {
    const luts = buildLuts({});
    for (const lut of luts) for (let i = 0; i < 256; i += 1) expect(Math.abs(lut[i] - i)).toBeLessThanOrEqual(1);
  });

  test('exposure brightens, warmth makes red stronger than blue, saturation 0 gives grey', () => {
    expect(adjustPixels(grey(100), { exposure: 1 })[0]).toBeGreaterThan(130);
    const warm = adjustPixels(grey(120), { temp: 60 });
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const px = adjustPixels(Uint8ClampedArray.from([200, 80, 40, 255]), { saturation: -100 });
    expect(Math.abs(px[0] - px[2])).toBeLessThanOrEqual(1);
  });

  test('tone curves never turn a brighter pixel darker than a dimmer one', () => {
    for (const e of [{ shadows: -100 }, { shadows: 100 }, { highlights: -100 }, { highlights: 100 }, { contrast: 100 }]) {
      const [lut] = buildLuts(e);
      for (let i = 1; i < 256; i += 1) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });

  test('Auto warms a blue picture part of the way and brightens a dark one', () => {
    const blueish = Uint8ClampedArray.from({ length: 400 }, (_, i) => [60, 70, 110, 255][i % 4]);
    const auto = autoEdits(blueish);
    expect(auto.temp).toBeGreaterThan(0);
    expect(auto.exposure).toBeGreaterThan(0);
    const fixed = adjustPixels(blueish.slice(0, 4), auto);
    expect(fixed[2] - fixed[0]).toBeLessThan(110 - 60);
    expect(fixed[2] - fixed[0]).toBeGreaterThan(0);
  });

  test('histogram is scaled to its tallest bin', () => {
    const h = histogram(grey(255));
    expect(h[3][63]).toBe(1);
    expect(h[3][0]).toBe(0);
  });
});

// A tiny but well-formed JPEG: start, a frame header with its size, a scan
// with a stuffed FF 00 and a restart marker, and the end marker.
function fakeJpeg(w, h, sof = 0xc0) {
  return [0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, sof, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd3, 0x56, 0xff, 0xd9];
}

describe('YorWare Photos raw files', () => {
  test('finds the biggest drawable picture inside a raw file and skips sensor data', () => {
    const bytes = Uint8Array.from([0x49, 0x49, 42, 0, 1, 2, 0xff, 0xd8, 9, ...fakeJpeg(160, 120), 7, 7,
      ...fakeJpeg(6000, 4000, 0xc3), 0, ...fakeJpeg(4000, 3000), 1, 2, 3]);
    const found = findEmbeddedJpegs(bytes);
    expect(found.map((j) => [j.w, j.h])).toEqual([[4000, 3000], [160, 120]]);
    expect(bytes[found[0].end - 1]).toBe(0xd9);
    expect(walkJpeg(Uint8Array.from([0xff, 0xd8, 0x00]), 0)).toBeNull();
  });

  test('raw names and orientation', () => {
    expect(isRawName('IMG_0001.CR2')).toBe(true);
    expect(isRawName('beach.jpg')).toBe(false);
    expect([1, 3, 6, 8].map(orientationToRot)).toEqual([0, 180, 90, 270]);
  });

  test('camera details from EXIF', () => {
    const meta = metaFromExif({ Make: 'Canon', Model: 'Canon EOS R6', ISO: 400, ExposureTime: 0.004, FNumber: 2.8, FocalLength: 35, DateTimeOriginal: new Date('2026-05-01T10:00:00Z') });
    expect(meta).toMatchObject({ camera: 'Canon EOS R6', iso: 400, taken: '2026-05-01T10:00:00.000Z' });
    expect(shotLine(meta)).toBe('1/250 s · f/2.8 · ISO 400 · 35 mm');
  });
});

describe('YorWare Photos library view', () => {
  test('filters by stars, flags, tags and text, and sorts', () => {
    let win = libWith('c.jpg', item('a.jpg', { camera: 'Sony A7' }), 'b.jpg');
    const [c, a, b] = readLibrary(win).order;
    win = apply(win, ratingPatch(readLibrary(win), a, { stars: 4, flag: 'pick', tags: ['beach'] }));
    win = apply(win, ratingPatch(readLibrary(win), b, { stars: 2, flag: 'reject' }));
    const lib = readLibrary(win);
    expect(visiblePhotos(lib, { stars: 3 })).toEqual([a]);
    expect(visiblePhotos(lib, { flag: 'hide-rejects' })).toEqual([c, a]);
    expect(visiblePhotos(lib, { tag: 'beach' })).toEqual([a]);
    expect(visiblePhotos(lib, { text: 'sony' })).toEqual([a]);
    expect(visiblePhotos(lib, { sort: 'name' })).toEqual([a, b, c]);
    expect(visiblePhotos(lib, { sort: 'stars' })).toEqual([a, b, c]);
    expect(allTags(lib)).toEqual([['beach', 1]]);
  });

  test('Photos is in the YorWare Suite section of the Add palette', () => {
    const suite = buildAddSections({ manifests: WINDOW_MANIFESTS }).find((s) => s.label === 'YorWare Suite');
    expect(suite.items.map((i) => i.id)).toContain('kind:yorPhotos');
    expect(normalizeEdits(undefined).flip).toBe(false);
  });
});
