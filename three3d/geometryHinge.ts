import * as THREE from 'three';

export function createGeometryHinge(model: THREE.Object3D): {
  update: (openPercent: number) => void;
  dispose: () => void;
} {
  model.updateMatrixWorld(true);
  const rootInverse = model.matrixWorld.clone().invert();
  const hingeY = 0.04;
  const meshes: Array<{
    geometry: THREE.BufferGeometry;
    positions: THREE.BufferAttribute;
    normals: THREE.BufferAttribute | null;
    originalPositions: Float32Array;
    originalNormals: Float32Array | null;
    rootPositions: Float32Array;
    rootNormals: Float32Array | null;
    rootToLocal: THREE.Matrix4;
    rootToLocalNormal: THREE.Matrix3;
  }> = [];

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
    const sourceGeometry = mesh.geometry;
    const sourcePositions = sourceGeometry.getAttribute('position') as THREE.BufferAttribute;
    const sourceNormals = sourceGeometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const originalPositions = new Float32Array(sourcePositions.array);
    const originalNormals = sourceNormals ? new Float32Array(sourceNormals.array) : null;
    const rootPositions = new Float32Array(sourcePositions.count * 3);
    const rootNormals = sourceNormals ? new Float32Array(sourceNormals.count * 3) : null;
    const localToRoot = rootInverse.clone().multiply(mesh.matrixWorld);
    const rootToLocal = localToRoot.clone().invert();
    const localToRootNormal = new THREE.Matrix3().getNormalMatrix(localToRoot);
    const rootToLocalNormal = new THREE.Matrix3().getNormalMatrix(rootToLocal);
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let index = 0; index < sourcePositions.count; index++) {
      position.fromArray(originalPositions, index * 3).applyMatrix4(localToRoot).toArray(rootPositions, index * 3);
      if (sourceNormals && rootNormals && originalNormals) {
        normal.fromArray(originalNormals, index * 3).applyMatrix3(localToRootNormal).normalize().toArray(rootNormals, index * 3);
      }
    }
    if (!rootPositions.some((coordinate, index) => index % 3 === 0 && coordinate > 0)) return;
    const geometry = sourceGeometry.clone();
    mesh.geometry = geometry;
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normals = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
    meshes.push({ geometry, positions, normals: normals ?? null, originalPositions, originalNormals,
      rootPositions, rootNormals, rootToLocal, rootToLocalNormal });
  });

  let previousPercent = 100;
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const update = (openPercent: number) => {
    const percent = THREE.MathUtils.clamp(openPercent, 0, 100);
    if (percent === previousPercent) return;
    previousPercent = percent;
    const angle = Math.PI * (1 - percent / 100);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (const mesh of meshes) {
      for (let index = 0; index < mesh.positions.count; index++) {
        const offset = index * 3;
        const rootX = mesh.rootPositions[offset];
        if (rootX <= 0) {
          mesh.positions.setXYZ(index, mesh.originalPositions[offset], mesh.originalPositions[offset + 1], mesh.originalPositions[offset + 2]);
          if (mesh.normals && mesh.originalNormals) {
            mesh.normals.setXYZ(index, mesh.originalNormals[offset], mesh.originalNormals[offset + 1], mesh.originalNormals[offset + 2]);
          }
          continue;
        }
        const rootY = mesh.rootPositions[offset + 1] - hingeY;
        position.set(rootX * cosine - rootY * sine, hingeY + rootX * sine + rootY * cosine, mesh.rootPositions[offset + 2]);
        position.applyMatrix4(mesh.rootToLocal);
        mesh.positions.setXYZ(index, position.x, position.y, position.z);
        if (mesh.normals && mesh.rootNormals) {
          const normalX = mesh.rootNormals[offset];
          const normalY = mesh.rootNormals[offset + 1];
          normal.set(normalX * cosine - normalY * sine, normalX * sine + normalY * cosine, mesh.rootNormals[offset + 2]);
          normal.applyMatrix3(mesh.rootToLocalNormal).normalize();
          mesh.normals.setXYZ(index, normal.x, normal.y, normal.z);
        }
      }
      mesh.positions.needsUpdate = true;
      if (mesh.normals) mesh.normals.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
  };
  return { update, dispose: () => meshes.forEach(({ geometry }) => geometry.dispose()) };
}
