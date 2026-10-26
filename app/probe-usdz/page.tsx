'use client';

// TEMPORARY probe route — dumps the structure of the AR Quick Look USDZ files.
// Not linked from anywhere; delete when the device definitions are settled.

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

function round(n: number) {
  return +n.toFixed(4);
}

function summarize(scene: THREE.Object3D) {
  const meshes: any[] = [];
  const roots: any[] = [];
  scene.updateMatrixWorld(true);
  for (const child of scene.children) {
    const box = new THREE.Box3().setFromObject(child);
    const size = box.getSize(new THREE.Vector3());
    roots.push({
      name: child.name,
      type: child.type,
      size: [round(size.x), round(size.y), round(size.z)],
      min: [round(box.min.x), round(box.min.y), round(box.min.z)],
      max: [round(box.max.x), round(box.max.y), round(box.max.z)],
    });
  }
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry as THREE.BufferGeometry;
    geo.computeBoundingBox();
    const local = geo.boundingBox ? geo.boundingBox.getSize(new THREE.Vector3()) : new THREE.Vector3();
    const world = new THREE.Box3().setFromObject(m);
    const wsize = world.getSize(new THREE.Vector3());
    const center = world.getCenter(new THREE.Vector3());
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const mm = mat as THREE.MeshStandardMaterial;
      meshes.push({
        name: o.name,
        mat: mm.name,
        type: mm.type,
        verts: geo.getAttribute('position')?.count ?? 0,
        uv: !!geo.getAttribute('uv'),
        local: [round(local.x), round(local.y), round(local.z)],
        world: [round(wsize.x), round(wsize.y), round(wsize.z)],
        center: [round(center.x), round(center.y), round(center.z)],
        color: mm.color ? '#' + mm.color.getHexString() : null,
        map: !!mm.map,
        emissive: (mm as any).emissive ? '#' + (mm as any).emissive.getHexString() : null,
        emissiveMap: !!(mm as any).emissiveMap,
        mismatch: ['map', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'alphaMap']
          .filter((k) => !!(mm as any)[k]).join(','),
        metalness: round((mm as any).metalness ?? 0),
        roughness: round((mm as any).roughness ?? 1),
        transparent: !!mm.transparent,
        opacity: (mm as any).opacity,
      });
    }
  });
  const box = new THREE.Box3().setFromObject(scene);
  const total = box.getSize(new THREE.Vector3());
  return {
    meshCount: meshes.length,
    totalSize: [round(total.x), round(total.y), round(total.z)],
    min: [round(box.min.x), round(box.min.y), round(box.min.z)],
    roots,
    meshes,
  };
}

export default function ProbeUsdz() {
  useEffect(() => {
    (async () => {
      const results: any[] = [];
      for (const file of FILES) {
        const t0 = performance.now();
        try {
          const scene = await loadAppleStyleUSDZ(new USDLoader(), `/3d/devices/${file}`);
          results.push({ file, ok: true, ms: Math.round(performance.now() - t0), ...summarize(scene) });
        } catch (err: any) {
          results.push({ file, ok: false, error: String(err?.message ?? err), ms: Math.round(performance.now() - t0) });
        }
        (window as any).__probe = results;
      }
      (window as any).__probeDone = true;
    })();
  }, []);
  return <pre id="probe">probing…</pre>;
}
