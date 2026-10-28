import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { PrintCheckView } from '../src/components/windows/yor3d/PrintCheck.jsx';
import { bakeWorldGeometry } from '../src/lib/yorware/printBake.js';
import { printCheck } from '../src/lib/yorware/printCheck.js';
import { checkShown } from '../src/lib/yorware/printScene.js';

function box(width, height, depth) {
  return new THREE.BoxGeometry(width, height, depth);
}

/** Drop the face whose normal points up (+Y). A default box face is two triangles. */
function withoutUpFace(geometry) {
  const geo = geometry.clone();
  const pos = geo.attributes.position;
  const index = geo.index;
  const keep = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i));
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (n.y > 1e-8) continue;
    keep.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  geo.setIndex(keep);
  return geo;
}

describe('printCheck', () => {
  test('a closed box has 0 open edges and the right size', () => {
    const check = printCheck(box(30, 40, 50));
    expect(check.openEdges).toBe(0);
    expect(check.closed).toBe(true);
    expect(check.triangles).toBe(12);
    expect(check.size.x).toBeCloseTo(30);
    expect(check.size.y).toBeCloseTo(40);
    expect(check.size.z).toBeCloseTo(50);
  });

  test('vertices a tiny distance apart still count as one point', () => {
    const geo = box(30, 40, 50);
    const pos = geo.attributes.position;
    pos.setX(0, pos.getX(0) + 1e-6);
    const check = printCheck(geo);
    expect(check.openEdges).toBe(0);
    expect(check.closed).toBe(true);
  });

  test('a box with one face removed reports open edges', () => {
    const check = printCheck(withoutUpFace(box(30, 40, 50)));
    expect(check.triangles).toBe(10);
    expect(check.openEdges).toBe(4);
    expect(check.closed).toBe(false);
    expect(check.size.x).toBeCloseTo(30);
    expect(check.size.y).toBeCloseTo(40);
    expect(check.size.z).toBeCloseTo(50);
  });

  test('a non-indexed geometry gives the same answer as the indexed one', () => {
    const indexed = box(30, 40, 50);
    const flat = indexed.toNonIndexed();
    expect(flat.index).toBeNull();
    expect(printCheck(flat)).toEqual(printCheck(indexed));

    const open = withoutUpFace(indexed);
    expect(printCheck(open.toNonIndexed())).toEqual(printCheck(open));
  });

  test('world space with Z up reports width, depth and height', () => {
    const mesh = new THREE.Mesh(box(10, 20, 30));
    mesh.rotation.x = Math.PI / 2;
    mesh.updateMatrixWorld(true);
    const check = printCheck(bakeWorldGeometry(mesh));
    expect(check.size.x).toBeCloseTo(10);
    expect(check.size.y).toBeCloseTo(30);
    expect(check.size.z).toBeCloseTo(20);
    expect(check.openEdges).toBe(0);
    expect(check.closed).toBe(true);
  });

  test('the STL pose is Z up, skips what is hidden, and puts the view back', () => {
    const shown = new THREE.Group();
    shown.add(new THREE.Mesh(box(10, 20, 30)));
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(box(100, 100, 100)));
    const root = new THREE.Group();
    root.add(shown);
    root.add(hidden);
    const stage = {
      models: root,
      view: { shading: 'wire', arrange: 'same' },
      dirty: false,
      setView(next) { this.view = { ...this.view, ...next }; },
    };
    const check = checkShown(stage);
    expect(check.size.x).toBeCloseTo(10);
    expect(check.size.y).toBeCloseTo(30);
    expect(check.size.z).toBeCloseTo(20);
    expect(check.openEdges).toBe(0);
    expect(check.closed).toBe(true);
    expect(root.rotation.x).toBe(0);
    expect(stage.view).toEqual({ shading: 'wire', arrange: 'same' });
    expect(root.children).toHaveLength(2);
    expect(stage.dirty).toBe(true);
  });

  test('the panel states the size in millimetres and any open edges', () => {
    const open = renderToStaticMarkup(React.createElement(PrintCheckView, {
      state: { check: { size: { x: 12, y: 8, z: 3 }, triangles: 24, openEdges: 12, closed: false } },
    }));
    expect(open).toContain('hb-panel');
    expect(open).toContain('hb-stat');
    expect(open).toContain('One model unit is one millimetre');
    expect(open).toContain('12 × 8 × 3');
    expect(open).toContain('12 open edges: a slicer may fill or skip these holes');

    const shut = renderToStaticMarkup(React.createElement(PrintCheckView, {
      state: { check: { size: { x: 30, y: 40, z: 50 }, triangles: 12, openEdges: 0, closed: true } },
    }));
    expect(shut).toContain('Closed mesh: every edge is shared by two triangles.');
    expect(shut).not.toContain('open edges:');
  });
});
