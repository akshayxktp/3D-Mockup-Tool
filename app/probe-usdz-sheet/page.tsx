'use client';

// TEMPORARY probe route — renders every USDZ from several angles into one
// contact sheet so the device orientation can be judged by eye.

import { useEffect, useRef } from 'react';
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

const VIEWS: Array<{ label: string; dir: [number, number, number] }> = [
  { label: '+Z', dir: [0, 0, 1] },
  { label: '-Z', dir: [0, 0, -1] },
  { label: '+X', dir: [1, 0, 0.001] },
  { label: '3q', dir: [1, 0.55, 1] },
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

export default function ProbeSheet() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    (async () => {
      const glCanvas = document.createElement('canvas');
      const cols = 4;
      const tile = 420;
      const rows = Math.ceil((FILES.length * VIEWS.length) / cols);
      glCanvas.width = cols * tile;
      glCanvas.height = rows * tile;
      const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(glCanvas.width, glCanvas.height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#202226');
      const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3f46, 2.2);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(2, 3, 4);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 1.2);
      fill.position.set(-3, 1, -2);
      scene.add(fill);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1e6);

      const group = new THREE.Group();
      scene.add(group);

      const labels: string[] = [];
      for (const file of FILES) {
        (window as any).__progress = file;
        let model: THREE.Group | null = null;
        try {
          model = await loadAppleStyleUSDZ(new USDLoader(), `/3d/devices/${file}`);
        } catch (err) {
          console.error(file, err);
        }
        group.clear();
        if (model) group.add(model);
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z);
        for (const view of VIEWS) {
          group.rotation.set(0, 0, 0);
          const dir = new THREE.Vector3(...view.dir).normalize();
          camera.position.copy(center).add(dir.multiplyScalar(radius * 2.1));
          camera.up.set(0, 1, 0);
          camera.lookAt(center);
          camera.near = radius * 0.01;
          camera.far = radius * 20;
          camera.aspect = 1;
          camera.updateProjectionMatrix();
          const idx = labels.length;
          const x = (idx % cols) * tile;
          const y = Math.floor(idx / cols) * tile;
          renderer.setViewport(x, glCanvas.height - y - tile, tile, tile);
          renderer.setScissor(x, glCanvas.height - y - tile, tile, tile);
          renderer.setScissorTest(true);
          renderer.render(scene, camera);
          labels.push(`${file}  ${view.label}`);
        }
        group.remove(model!);
      }

      // Composite the WebGL sheet into a 2D canvas so labels can be drawn.
      const canvas = ref.current!;
      canvas.width = glCanvas.width;
      canvas.height = glCanvas.height;
      const ctx2d = canvas.getContext('2d')!;
      ctx2d.drawImage(glCanvas, 0, 0);
      ctx2d.font = '600 17px monospace';
      for (let i = 0; i < labels.length; i++) {
        const x = (i % cols) * tile;
        const y = Math.floor(i / cols) * tile;
        ctx2d.fillStyle = 'rgba(0,0,0,0.65)';
        ctx2d.fillRect(x, y, tile, 26);
        ctx2d.fillStyle = '#9ef';
        ctx2d.fillText(labels[i], x + 8, y + 18);
      }
      (window as any).__sheet = canvas.toDataURL('image/png');
      (window as any).__sheetDone = true;
    })();
  }, []);
  return <canvas ref={ref} />;
}
