import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GLBSource {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

// Parsing a device GLB is substantially more expensive than fetching it from
// the browser cache. Keep the untouched parsed scene here so the main preview
// and its thumbnail sheet share one request and one parse.
const scenePromises = new Map<string, Promise<GLBSource>>();
const loader = new GLTFLoader();

export function loadGLBSource(url: string): Promise<GLBSource> {
  const cached = scenePromises.get(url);
  if (cached) return cached;

  const pending = new Promise<GLBSource>((resolve, reject) => {
    loader.load(url, (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }), undefined, reject);
  }).catch((error) => {
    // A transient failure must remain retryable.
    scenePromises.delete(url);
    throw error;
  });

  scenePromises.set(url, pending);
  return pending;
}
