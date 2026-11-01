// Flatten every visible mesh under a three.js object into one geometry whose
// positions are already in world space. The print check then sees the same
// triangles an STL export would write.
import * as THREE from 'three';

export function bakeWorldGeometry(root) {
  const positions = [];
  const v = new THREE.Vector3();
  const walk = (object) => {
    if (!object || object.visible === false) return;
    const pos = object.geometry?.attributes?.position;
    if (object.isMesh && pos) {
      const index = object.geometry.index;
      const count = index ? index.count : pos.count;
      const triangles = Math.floor(count / 3);
      for (let t = 0; t < triangles; t++) {
        for (let k = 0; k < 3; k++) {
          const vi = index ? index.getX(t * 3 + k) : t * 3 + k;
          v.fromBufferAttribute(pos, vi).applyMatrix4(object.matrixWorld);
          positions.push(v.x, v.y, v.z);
        }
      }
    }
    for (const child of object.children || []) walk(child);
  };
  walk(root);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
