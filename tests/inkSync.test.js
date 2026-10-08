import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

const stroke = (id, x = 0) => ({ id, ink: 1, color: 'var(--ink)', size: 4, pts: [{ x, y: 0, p: 0.5 }, { x: x + 10, y: 5, p: 0.7 }] });

function offlinePair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  return { a, b, sync };
}

describe('ink strokes merge between people (spec 9)', () => {
  const ids = (doc) => readDocState(doc, { paths: [] }).paths.map((p) => p.id).sort();

  test('one person erases while another draws: the new stroke survives', () => {
    const { a, b, sync } = offlinePair();
    const base = { paths: [stroke('s1'), stroke('s2', 50)] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    writeStateToDoc(a, base, { paths: [base.paths[1]] }, 'local'); // A erases s1
    writeStateToDoc(b, base, { paths: [...base.paths, stroke('fromB', 99)] }, 'local'); // B draws
    sync();
    expect(ids(a)).toEqual(['fromB', 's2']);
    expect(ids(b)).toEqual(ids(a));
  });

  test('cleaning up a stroke rewrites only that stroke', () => {
    const { a, b, sync } = offlinePair();
    const base = { paths: [stroke('s1'), stroke('s2', 50)] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const cleaned = { ...base.paths[0], shape: 'line' };
    writeStateToDoc(a, base, { paths: [cleaned, base.paths[1]] }, 'local');
    writeStateToDoc(b, base, { paths: [...base.paths, stroke('fromB', 99)] }, 'local');
    sync();
    const paths = readDocState(b, { paths: [] }).paths;
    expect(paths.map((p) => p.id).sort()).toEqual(['fromB', 's1', 's2']);
    expect(paths.find((p) => p.id === 's1').shape).toBe('line');
    expect(readDocState(a, { paths: [] }).paths).toEqual(paths);
  });

  test('lists without ids still sync by replacing the list', () => {
    const { a, b, sync } = offlinePair();
    const base = { paths: [{ pts: [] }, { pts: [{ x: 1, y: 1 }] }] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    writeStateToDoc(a, base, { paths: [base.paths[1]] }, 'local');
    sync();
    expect(readDocState(b, { paths: [] }).paths).toEqual([base.paths[1]]);
  });
});
