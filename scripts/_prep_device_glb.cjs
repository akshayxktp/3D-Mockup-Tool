// Prepare a raw device GLB for three3d/mockup.ts.
//
//   node scripts/_prep_device_glb.cjs <source.glb> <out.glb> <screenMeshIndex>
//
// The mockup renderer expects two things of a device mesh that a downloaded
// model almost never satisfies:
//
//   1. the panel is found by MATERIAL NAME 'Screen' (three3d/mockup.ts:1413),
//      and
//   2. the panel is flat on one geometry axis, because ensureScreenUVs()
//      builds its planar unwrap from the geometry's local bounding box — a
//      screen sitting at an angle unwraps skewed.
//
// So this rotates the whole model about X until the panel's own plane normal
// points down +Z (the orientation the bundled devices are authored in),
// renames the panel mesh/node/material to 'Screen', and drops that mesh's
// authored UVs, which are an atlas unwrap the screen material never samples.
//
// Find the screen mesh index by dumping the model's meshes and looking for
// the flat one whose aspect matches the device's real display.
const fs = require('fs');
const SRC = process.argv[2];
const DST = process.argv[3];
if (!SRC || !DST) {
  console.error('usage: node scripts/_prep_device_glb.cjs <source.glb> <out.glb> <screenMeshIndex>');
  process.exit(1);
}

const buf = fs.readFileSync(SRC);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binOff = 20 + jsonLen;
const binLen = buf.readUInt32LE(binOff);
const bin = Buffer.from(buf.slice(binOff + 8, binOff + 8 + binLen));   // mutable copy

// The panel, named either by mesh index or by the material it already uses.
// A mesh can hold several primitives (one per material), so resolve BOTH the
// mesh and the primitive — the panel is often not primitive 0.
const SEL = process.argv[4] ?? '17';
let SCREEN_MESH = -1, SCREEN_PRIM = 0;
if (/^\d+$/.test(SEL)) SCREEN_MESH = Number(SEL);
else {
  json.meshes.forEach((m, mi) => m.primitives.forEach((pr, pi) => {
    if (SCREEN_MESH < 0 && json.materials[pr.material] && json.materials[pr.material].name === SEL) {
      SCREEN_MESH = mi; SCREEN_PRIM = pi;
    }
  }));
}
if (SCREEN_MESH < 0) {
  console.error(`no mesh uses a material named "${SEL}". materials:\n  ` +
    json.materials.map((m) => m.name).join('\n  '));
  process.exit(1);
}

// Some product-render exports ship the device TWICE — one copy turned around
// so a still can show the front and the back side by side. A device mesh has
// to be one device, so those extra copies are named here and dropped from the
// scene. (Their meshes stay in the buffer, unreferenced and never loaded.)
const DROP = (process.argv[5] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
if (DROP.length) {
  const before = json.scenes[0].nodes.length;
  json.scenes[0].nodes = json.scenes[0].nodes.filter((n) => !DROP.includes(json.nodes[n].name));
  console.log(`dropped ${before - json.scenes[0].nodes.length} duplicate root node(s): ${DROP.join(', ')}`);
}


// ── 1. exact plane normal of the screen, by least squares ──────────────────
function accView(i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
  const nc = { VEC4: 4, VEC3: 3, VEC2: 2, SCALAR: 1 }[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || nc * 4;
  return { count: a.count, nc, start, stride, acc: a };
}
function readVec(v, k) {
  const o = v.start + k * v.stride, out = [];
  for (let c = 0; c < v.nc; c++) out.push(bin.readFloatLE(o + c * 4));
  return out;
}
function writeVec(v, k, val) {
  const o = v.start + k * v.stride;
  for (let c = 0; c < val.length; c++) bin.writeFloatLE(val[c], o + c * 4);
}

const sp = accView(json.meshes[SCREEN_MESH].primitives[SCREEN_PRIM].attributes.POSITION);
const mean = [0, 0, 0];
for (let k = 0; k < sp.count; k++) { const p = readVec(sp, k); mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; }
mean.forEach((_, i) => mean[i] /= sp.count);
const C = [[0,0,0],[0,0,0],[0,0,0]];
for (let k = 0; k < sp.count; k++) {
  const p = readVec(sp, k), d = [p[0]-mean[0], p[1]-mean[1], p[2]-mean[2]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i]*d[j];
}
const tr = C[0][0] + C[1][1] + C[2][2];
const D = C.map((row, i) => row.map((x, j) => (i === j ? tr - x : -x)));
let nv = [0.1, 0.4, 0.9];
const mul = (M, v) => M.map(r => r[0]*v[0] + r[1]*v[1] + r[2]*v[2]);
const nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
for (let k = 0; k < 400; k++) nv = nrm(mul(D, nv));
// A plane fit gives the panel's axis but not which way it looks, and the two
// answers are 180 degrees apart: a phone authored face-down fits exactly as
// well as one authored face-up. Resolve it from the body — the screen looks
// AWAY from the middle of the device — rather than from the fit.
{
  const all = [];
  for (const mesh of json.meshes) for (const pr of mesh.primitives) {
    const a = json.accessors[pr.attributes.POSITION];
    if (a && a.min) all.push(a);
  }
  const lo = [0, 1, 2].map((c) => Math.min(...all.map((a) => a.min[c])));
  const hi = [0, 1, 2].map((c) => Math.max(...all.map((a) => a.max[c])));
  const mid = [0, 1, 2].map((c) => (lo[c] + hi[c]) / 2);
  const out = [0, 1, 2].reduce((acc, c) => acc + (mean[c] - mid[c]) * nv[c], 0);
  if (out < 0) nv = nv.map((x) => -x);
}
console.log(`screen normal = [${nv.map(x => x.toFixed(6))}] (outward)`);

// Rotate that normal onto +Z. Rodrigues rather than a single-axis turn, so a
// mesh authored at a compound angle squares up too.
const dotZ = nv[2];
let R;
if (dotZ > 0.999999) R = [[1,0,0],[0,1,0],[0,0,1]];
// Face-down: turn it over about the VERTICAL axis. The other half turn that
// also brings the panel to +Z is about X, and that one negates Y — it stands
// the device on its head, which the screen texture then hides, because
// ensureScreenUVs() rebuilds UVs from the bounding box and so reads upright
// either way. The camera bump ends up at the wrong end instead.
else if (dotZ < -0.999999) R = [[-1,0,0],[0,1,0],[0,0,-1]];
else {
  const ax = [nv[1], -nv[0], 0];                                // nv x (0,0,1)
  const sl = Math.hypot(...ax), k = ax.map((x) => x / sl), c = dotZ, t = 1 - c, sI = sl;
  R = [
    [t*k[0]*k[0]+c,      t*k[0]*k[1]-sI*k[2], t*k[0]*k[2]+sI*k[1]],
    [t*k[0]*k[1]+sI*k[2], t*k[1]*k[1]+c,      t*k[1]*k[2]-sI*k[0]],
    [t*k[0]*k[2]-sI*k[1], t*k[1]*k[2]+sI*k[0], t*k[2]*k[2]+c     ],
  ];
}
let rot = ([x, y, z]) => [R[0][0]*x+R[0][1]*y+R[0][2]*z, R[1][0]*x+R[1][1]*y+R[1][2]*z, R[2][0]*x+R[2][1]*y+R[2][2]*z];

// Facing fixes only where the device looks; the spin about +Z is still free,
// and left arbitrary it lands the device a few degrees off vertical. Solve it
// from the panel: the angle whose axis-aligned box around the screen is
// smallest is the one where the screen's own edges are level.
{
  const pts = [];
  for (let k = 0; k < sp.count; k++) pts.push(rot(readVec(sp, k)));
  let best = { area: Infinity, a: 0, w: 0, h: 0 };
  for (let deg = 0; deg < 90; deg += 0.02) {
    const a = deg * Math.PI / 180, c = Math.cos(a), sn2 = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const x = p[0]*c - p[1]*sn2, y = p[0]*sn2 + p[1]*c;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (area < best.area) best = { area, a, w: x1 - x0, h: y1 - y0 };
  }
  let a = best.a;
  if (best.w > best.h) a += Math.PI / 2;      // phones and watches stand portrait
  const c = Math.cos(a), sn2 = Math.sin(a), base = rot;
  rot = (v) => { const p = base(v); return [p[0]*c - p[1]*sn2, p[0]*sn2 + p[1]*c, p[2]]; };
  console.log(`roll corrected by ${(a * 180 / Math.PI).toFixed(3)}deg about +Z`);
}

// ── 2. rotate every POSITION / NORMAL / TANGENT accessor exactly once ──────
const done = new Set();
let nAcc = 0;
for (const mesh of json.meshes) for (const pr of mesh.primitives) {
  for (const attr of ['POSITION', 'NORMAL', 'TANGENT']) {
    const idx = pr.attributes[attr];
    if (idx == null || done.has(idx)) continue;
    done.add(idx); nAcc++;
    const v = accView(idx);
    let mn = null, mx = null;
    for (let k = 0; k < v.count; k++) {
      const val = readVec(v, k);
      const r = rot([val[0], val[1], val[2]]);
      const out = v.nc === 4 ? [...r, val[3]] : r;       // TANGENT keeps its w
      writeVec(v, k, out);
      if (!mn) { mn = out.slice(); mx = out.slice(); }
      else for (let c = 0; c < out.length; c++) { if (out[c] < mn[c]) mn[c] = out[c]; if (out[c] > mx[c]) mx[c] = out[c]; }
    }
    if (v.acc.min) { v.acc.min = mn; v.acc.max = mx; }
  }
}
console.log(`rotated ${nAcc} accessors`);

// ── 3. the repo's device convention: mesh AND material named "Screen" ──────
if (json.meshes[SCREEN_MESH].primitives.length === 1) json.meshes[SCREEN_MESH].name = 'Screen';
json.materials[json.meshes[SCREEN_MESH].primitives[SCREEN_PRIM].material].name = 'Screen';
if (json.meshes[SCREEN_MESH].primitives.length === 1)
  for (const n of json.nodes) if (n.mesh === SCREEN_MESH) n.name = 'Screen';

// The Sketchfab UVs on the panel are an atlas unwrap, not a 0..1 planar one.
// The material has no map, so they are dead data — dropping them makes
// ensureScreenUVs() in three3d/mockup.ts build the planar unwrap the screen
// texture needs.
const sprim = json.meshes[SCREEN_MESH].primitives[SCREEN_PRIM];
for (const k of Object.keys(sprim.attributes)) if (k.startsWith('TEXCOORD')) delete sprim.attributes[k];
console.log('screen attrs now:', Object.keys(sprim.attributes).join(','));

// ── 4. write the GLB back out ──────────────────────────────────────────────
let js = Buffer.from(JSON.stringify(json), 'utf8');
if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
let bn = bin;
if (bn.length % 4) bn = Buffer.concat([bn, Buffer.alloc(4 - (bn.length % 4), 0)]);
const total = 12 + 8 + js.length + 8 + bn.length;
const head = Buffer.alloc(12);
head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bn.length, 0); bh.writeUInt32LE(0x004E4942, 4);
fs.writeFileSync(DST, Buffer.concat([head, jh, js, bh, bn]));
console.log('wrote', DST, (fs.statSync(DST).size / 1048576).toFixed(1) + ' MB');
