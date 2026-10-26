import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { asset } from '@/lib/paths';

// ── Studio environments (ported from the Matte app) ─────────────────────────
// Matte ships five studio HDRIs — Studio01.hdr plus four EXR maps — and its
// Lighting panel simply picks one of them; the map IS the lighting, plus a
// horizontal/vertical rotation and a "show environment" switch. The files here
// are the app's own, copied byte-for-byte out of Resources (1500×750 and
// 1536×768 equirectangular, so an ordinary PMREM import reproduces what its
// Metal renderer sees).
//
// Names match Matte's UI exactly ("Studio 01" … "Studio 05"); `key` matches its
// preset identifiers (studio-default, studio-02 … studio-05) so a project that
// already stores one keeps resolving.
export interface StudioEnvironmentPreset {
  key: string;
  label: string;
  file: string;
}

export const STUDIO_ENVIRONMENTS: StudioEnvironmentPreset[] = [
  { key: 'studio-default', label: 'Studio 01', file: '/3d/env/Studio01.hdr' },
  { key: 'studio-02', label: 'Studio 02', file: '/3d/env/Studio02.exr' },
  { key: 'studio-03', label: 'Studio 03', file: '/3d/env/Studio03.exr' },
  { key: 'studio-04', label: 'Studio 04', file: '/3d/env/Studio04.exr' },
  { key: 'studio-05', label: 'Studio 05', file: '/3d/env/Studio05.exr' },
];

export const STUDIO_LABELS = STUDIO_ENVIRONMENTS.map((e) => e.label);

// Old builds offered five invented lighting looks under these names. A saved
// project still carries one, so each maps onto the studio that is closest in
// intent rather than silently dropping to the first entry.
const LEGACY_PRESET: Record<string, string> = {
  Default: 'studio-default',
  'Studio Soft': 'studio-default',
  'Dark Rim': 'studio-04',
  'Two Tone': 'studio-03',
  'Warm Glow': 'studio-05',
};

export function studioEnvironmentFor(value: unknown): StudioEnvironmentPreset {
  const raw = String(value ?? '');
  const byLabel = STUDIO_ENVIRONMENTS.find((e) => e.label === raw);
  if (byLabel) return byLabel;
  const byKey = STUDIO_ENVIRONMENTS.find((e) => e.key === raw);
  if (byKey) return byKey;
  const legacy = LEGACY_PRESET[raw];
  if (legacy) return STUDIO_ENVIRONMENTS.find((e) => e.key === legacy)!;
  return STUDIO_ENVIRONMENTS[0];
}

export interface StudioEnvironment {
  /** PMREM-filtered map for scene.environment. */
  env: THREE.Texture;
  /** The original equirectangular map, for Matte's "show environment" background. */
  background: THREE.Texture;
}

// PMREM output is a GPU resource tied to the WebGL context that generated it.
// Device switches recreate the renderer, so a process-wide cache here could
// hand the new renderer an environment texture from the old context. Keep both
// finished maps and in-flight conversions scoped to their renderer instead.
const cache = new WeakMap<THREE.WebGLRenderer, Map<string, StudioEnvironment>>();
const inflight = new WeakMap<THREE.WebGLRenderer, Map<string, Promise<StudioEnvironment>>>();

export function loadStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  preset: StudioEnvironmentPreset,
): Promise<StudioEnvironment> {
  let rendererCache = cache.get(renderer);
  if (!rendererCache) cache.set(renderer, rendererCache = new Map());
  let rendererInflight = inflight.get(renderer);
  if (!rendererInflight) inflight.set(renderer, rendererInflight = new Map());
  const cached = rendererCache.get(preset.key);
  if (cached) return Promise.resolve(cached);
  const running = rendererInflight.get(preset.key);
  if (running) return running;

  const isExr = /\.exr$/i.test(preset.file);
  const loader = isExr ? new EXRLoader() : new RGBELoader();
  // Both loaders return linear float data, which is what an environment map
  // wants; PMREM then builds the roughness mip chain the PBR shader samples.
  // The raw map is kept as well because a PMREM result cannot be used as
  // scene.background — the background needs the equirectangular original.
  let task: Promise<StudioEnvironment>;
  task = loader.loadAsync(asset(preset.file)).then((texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromEquirectangular(texture);
    pmrem.dispose();
    const value: StudioEnvironment = { env: target.texture, background: texture };
    // The renderer may have been torn down while the HDR/EXR decoded.
    // In that case its completion is no longer eligible for the live cache.
    const stillCurrent = rendererInflight?.get(preset.key) === task;
    rendererInflight!.delete(preset.key);
    if (!stillCurrent) {
      value.env.dispose();
      value.background.dispose();
      return value;
    }
    rendererCache.set(preset.key, value);
    return value;
  }).catch((error) => {
    rendererInflight!.delete(preset.key);
    throw error;
  });
  rendererInflight.set(preset.key, task);
  return task;
}

export function disposeStudioEnvironments(renderer: THREE.WebGLRenderer) {
  const rendererCache = cache.get(renderer);
  for (const value of rendererCache?.values() ?? []) {
    value.env.dispose();
    value.background.dispose();
  }
  rendererCache?.clear();
  inflight.get(renderer)?.clear();
}
