#!/usr/bin/env node
require('sucrase/register');
const assert = require('node:assert/strict');
const THREE = require('three');
const { createGeometryHinge } = require('../three3d/geometryHinge');

const model = new THREE.Group();
model.rotation.x = Math.PI / 2;
const child = new THREE.Group();
child.position.x = 1;
model.add(child);
const source = new THREE.BufferGeometry();
source.setAttribute('position', new THREE.Float32BufferAttribute([
  -2, 0, 0, -1, 0, 0, -1, 0, 1,
  0, 0, 0, 1, 0, 0, 1, 0, 1,
], 3));
source.computeVertexNormals();
const mesh = new THREE.Mesh(source, new THREE.MeshBasicMaterial());
child.add(mesh);

const hinge = createGeometryHinge(model);
const position = mesh.geometry.getAttribute('position');
const point = (index) => new THREE.Vector3().fromBufferAttribute(position, index).add(child.position);
assert.notEqual(mesh.geometry, source, 'folding must leave cached source geometry intact');

hinge.update(50);
assert.ok(Math.abs(point(0).x + 1) < 1e-5, 'left half stays fixed');
assert.ok(Math.abs(point(4).x - 0.04) < 1e-5 && point(4).y > 1.9, 'right half stands on hinge at midpoint');

hinge.update(0);
assert.ok(Math.abs(point(4).x + 2) < 1e-5 && point(4).y > 0, 'right half closes over left half');
hinge.update(100);
assert.ok(Math.abs(point(4).x - 2) < 1e-5 && Math.abs(point(4).y) < 1e-5, 'full open restores original pose');
assert.equal(source.getAttribute('position').getX(4), 1, 'cached source is unchanged');
hinge.dispose();
console.log('Geometry hinge verification passed.');
