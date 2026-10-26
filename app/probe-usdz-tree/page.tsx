'use client';

// TEMPORARY probe route — object tree of the AR assets (duplicate copies?).

import { useEffect } from 'react';
import * as THREE from 'three';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import { unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';

const FILES = [
  'iphone-17-pro-e-sim.usdz',
  'iphone-18-pro-e-sim.usdz',
  'ipad-pro-13-M4-black.usdz',
  'macbook-pro-14-2024-M4-space-black.usdz',
  'iphone-air-e-sim.usdz',
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

const r = (n: number) => +n.toFixed(3);

function dumpTree(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const out: string[] = [];
  const walk = (o: THREE.Object3D, depth: number) => {
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const mesh = o as THREE.Mesh;
    const emissive = mesh.isMesh && !!(mesh.material as any)?.emissiveMap;
    out.push(
      `${'  '.repeat(depth)}${o.type} "${o.name}" children=${o.children.length}` +
      ` size=${[size.x, size.y, size.z].map(r).join(',')} c=${[c.x, c.y, c.z].map(r).join(',')}` +
      (mesh.isMesh ? ` MESH emissive=${emissive}` : ''),
    );
    for (const ch of o.children) walk(ch, depth + 1);
  };
  walk(root, 0);
  return out;
}

export default function ProbeTree() {
  useEffect(() => {
    (async () => {
      const results: any[] = [];
      for (const file of FILES) {
        try {
          const scene = await loadAppleStyleUSDZ(new USDLoader(), `/3d/devices/${file}`);
          results.push({ file, tree: dumpTree(scene) });
        } catch (err: any) {
          results.push({ file, error: String(err?.message ?? err) });
        }
        (window as any).__tree = results;
      }
      (window as any).__treeDone = true;
    })();
  }, []);
  return <pre>tree…</pre>;
}
