import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import { unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';

export interface GLBSource {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

// Parsing a device GLB is substantially more expensive than fetching it from
// the browser cache. Keep the untouched parsed scene here so the main preview
// and its thumbnail sheet share one request and one parse.
const scenePromises = new Map<string, Promise<GLBSource>>();
const loader = new GLTFLoader();

async function loadAppleStyleUSDZ(loader: USDLoader, url: string): Promise<THREE.Group> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`USDZ request failed: ${response.status} ${response.statusText}`);

  const source = new Uint8Array(await response.arrayBuffer());
  const archive = unzipSync(source);
  const usdLayers = Object.keys(archive).filter((name) => /\.(usd|usda|usdc)$/i.test(name));

  // Apple AR Quick Look packages commonly put a tiny composition layer first,
  // with the actual geometry layer referenced through a payload. Three's USD
  // parser currently stops on that PayloadListOp before resolving the payload.
  // Reordering the package in memory preserves the original USDZ asset and all
  // of its textures while presenting the embedded geometry layer directly.
  const geometryLayer = usdLayers.find((name) => /\.usdc$/i.test(name) && name !== usdLayers[0]);
  if (!geometryLayer || usdLayers.length < 2) {
    return await new Promise<THREE.Group>((resolve, reject) => {
      loader.parse(source.buffer, '', resolve, reject);
    });
  }

  const reordered = {
    [geometryLayer]: archive[geometryLayer],
    ...Object.fromEntries(Object.entries(archive).filter(([name]) => name !== geometryLayer)),
  };
  const normalized = zipSync(reordered);

  return await new Promise<THREE.Group>((resolve, reject) => {
    loader.parse(normalized.buffer, '', resolve, reject);
  });
}

export function loadGLBSource(url: string): Promise<GLBSource> {
  const cached = scenePromises.get(url);
  if (cached) return cached;

  const pending = new Promise<GLBSource>((resolve, reject) => {
    if (/\.usdz(?:$|\?)/i.test(url)) {
      loadAppleStyleUSDZ(new USDLoader(), url)
        .then((scene) => resolve({ scene, animations: [] }), reject);
      return;
    }
    loader.load(url, (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }), undefined, reject);
  }).catch((error) => {
    // A transient failure must remain retryable.
    scenePromises.delete(url);
    throw error;
  });

  scenePromises.set(url, pending);
  return pending;
}
