'use client';

// TEMPORARY probe route — measures each AR asset's display quad: its size,
// outward normal and the rotation that would stand the device up facing +Z.

import { useEffect } from 'react';
import * as THREE from 'three';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import { unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';

const FILES = [
  'apple-homeview.usdz',
  'iPhone_Duo_e-sim_Star-White_Variant.usdz',
  'imac-24-silver.usdz',
  'ipad-pro-13-M4-black.usdz',
  'ipad-pro-13-M4-silver.usdz',
  'iphone-17-e-sim.usdz',
  'iphone-17-pro-e-sim.usdz',
  'iphone-18-pro-e-sim.usdz',
  'iphone-air-e-sim.usdz',
  'macbook-pro-14-2024-M4-space-black.usdz',
  'macbook-pro-14-2025-space-black.usdz',
  'macbook-pro-16-2024-M4-space-black.usdz',
  'studio-display.usdz',
  'watch-series-11.usdz',
  'watch-ultra-3.usdz',
];

async function loadAppleStyleUSDZ(loader: USDLoader, url: string): Promise<THREE.Group> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`USDZ request failed: ${response.status}`);
  const source = new Uint8Array(await response.arrayBuffer());
  const archive = unzipSync(source);
  const usdLayers = Object.keys(archive).filter((name) => /\.(usd|usda|usdc)$/i.test(name));
  const geometryLayer = usdLayers.find((name) => /\.usdc$/i.test(name) && name !== usdLayers[0]);
  if (!geometryLayer || usdLayers.length < 2) {
    return await new Promise<THREE.Group>((resolve, reject) => {
      loader.parse(source.buffer as ArrayBuffer, '', resolve, reject);
    });
  }
  const reordered = {
    [geometryLayer]: archive[geometryLayer],
    ...Object.fromEntries(Object.entries(archive).filter(([name]) => name !== geometryLayer)),
  };
  const normalized = zipSync(reordered);
  return await new Promise<THREE.Group>((resolve, reject) => {
    loader.parse(normalized.buffer as ArrayBuffer, '', resolve, reject);
  });
}

const r = (n: number) => +n.toFixed(4);

// Area-weighted average of the display's own face normals, expressed in the
// MODEL's space. Winding survives the USD import, so this points out of the
// glass — unlike the bbox's thin axis, which only says which way the plane is.
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
    const area = fn.length();
    if (area < 1e-12) continue;
    fn.normalize();
    na.fromBufferAttribute(nrm, ia).applyMatrix3(nm).normalize();
    nb.fromBufferAttribute(nrm, ib).applyMatrix3(nm).normalize();
    nc.fromBufferAttribute(nrm, ic).applyMatrix3(nm).normalize();
    const vn = na.clone().add(nb).add(nc).normalize();
    // Prefer the geometric normal's orientation but keep the sign the surface
    // normals agree with.
    if (vn.dot(fn) < 0) vn.negate();
    avg.addScaledVector(vn, area);
  }
  if (avg.lengthSq() < 1e-12) return null;
  return avg.normalize();
}

export default function ProbeScreen() {
  useEffect(() => {
    (async () => {
      const results: any[] = [];
      for (const file of FILES) {
        try {
          const scene = await loadAppleStyleUSDZ(new USDLoader(), `/3d/devices/${file}`);
          scene.updateMatrixWorld(true);
          const displays: any[] = [];
          scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            if (!(m.material as any)?.emissiveMap) return;
            const geo = m.geometry;
            geo.computeBoundingBox();
            const size = geo.boundingBox!.getSize(new THREE.Vector3());
            const n = faceNormalInModel(m);
            const center = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
            let rotation: number[] | null = null;
            if (n) {
              const up = new THREE.Vector3(0, 1, 0);
              up.addScaledVector(n, -up.dot(n));
              if (up.lengthSq() < 0.01) {
                up.set(0, 0, -1).addScaledVector(n, -new THREE.Vector3(0, 0, -1).dot(n));
              }
              up.normalize();
              const right = new THREE.Vector3().crossVectors(up, n).normalize();
              const basis = new THREE.Matrix4().makeBasis(right, up, n);
              const q = new THREE.Quaternion().setFromRotationMatrix(basis);
              const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
              rotation = [e.x, e.y, e.z].map((v) => +(THREE.MathUtils.radToDeg(v)).toFixed(1));
            }
            displays.push({
              name: m.name,
              geoSize: [size.x, size.y, size.z].map(r),
              geoAspect: +(Math.max(size.x, size.y) / Math.max(1e-9, Math.min(size.x, size.y))).toFixed(3),
              center: [center.x, center.y, center.z].map(r),
              normal: n ? [n.x, n.y, n.z].map(r) : null,
              rotationDeg: rotation,
            });
          });
          const box = new THREE.Box3().setFromObject(scene);
          const sz = box.getSize(new THREE.Vector3());
          results.push({ file, total: [sz.x, sz.y, sz.z].map(r), displays });
        } catch (err: any) {
          results.push({ file, error: String(err?.message ?? err) });
        }
        (window as any).__screen = results;
      }
      (window as any).__screenDone = true;
    })();
  }, []);
  return <pre>screen probe…</pre>;
}
