'use client';

// TEMPORARY probe route — measures the screen normal of the EXISTING bundled
// GLB devices, so the AR assets can be posed the same way.

import { useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const FILES = [
  '/3d/devices/macbook14-clean.glb',
  '/3d/devices/ipadpro.glb',
  '/3d/devices/iphone17pro-clean.glb',
  '/3d/devices/displayxdr.glb',
  '/3d/devices/studiodisplay.glb',
  '/3d/devices/apple-watch-ultra.glb',
];

function faceNormalInModel(mesh: THREE.Mesh): THREE.Vector3 | null {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const index = geo.index;
  if (!pos || !nrm) return null;
  mesh.updateWorldMatrix(true, false);
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
  const avg = new THREE.Vector3();
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
    fn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    if (fn.length() < 1e-9) continue;
    fn.normalize();
    na.fromBufferAttribute(nrm, ia).applyMatrix3(nm).normalize();
    nb.fromBufferAttribute(nrm, ib).applyMatrix3(nm).normalize();
    nc.fromBufferAttribute(nrm, ic).applyMatrix3(nm).normalize();
    const vn = na.clone().add(nb).add(nc).normalize();
    if (vn.dot(fn) < 0) vn.negate();
    avg.add(vn);
  }
  return avg.lengthSq() < 1e-9 ? null : avg.normalize();
}

export default function ProbeGlbNormals() {
  useEffect(() => {
    (async () => {
      const out: any[] = [];
      for (const url of FILES) {
        const gltf = await new GLTFLoader().loadAsync(url);
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const name = (Array.isArray(m.material) ? m.material[0] : m.material)?.name;
          if (name !== 'Screen') return;
          const n = faceNormalInModel(m);
          const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
          out.push({ url, name, normal: n && [n.x, n.y, n.z].map((v) => +v.toFixed(3)), size: [size.x, size.y, size.z].map((v) => +v.toFixed(3)) });
        });
      }
      (window as any).__normals = out;
      (window as any).__normalsDone = true;
    })();
  }, []);
  return <pre>normals…</pre>;
}
