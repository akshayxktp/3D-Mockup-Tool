// Give a device mesh a real display, when its whole front is one textured
// plate.
//
//   node scripts/_inset_screen_glb.cjs <in.glb> <out.glb> <plateMaterial> \
//        <u0,v0,u1,v1> [dropNodes]
//
// Some phone meshes are modelled as a single quad across the entire front,
// with the metal rail, the black bezel, the punch-hole camera and a wallpaper
// all PAINTED INTO one texture. Pointing three3d/mockup.ts at that plate makes
// the uploaded artwork cover the whole face — the bezel and the camera are
// texture, so they go with it, and the render loses everything that makes the
// front read as a phone.
//
// The fix is to leave the plate exactly as authored — it keeps its texture, so
// it keeps drawing the rail, bezel and camera — and lay a separate quad over
// just the active display area. That quad is what gets named 'Screen', so it
// is what the app composites onto. `u0,v0,u1,v1` is the display's rectangle in
// the plate texture's own UV space, which is measurable off the texture image.
//
// The app rounds the artwork's own corners (screenCornerFrac) and draws the
// screen material with transparent: true, so this quad is a plain rectangle —
// the cleared corners simply reveal the bezel underneath.
const fs = require('fs');

const [SRC, OUT, PLATE, RECT, DROP] = process.argv.slice(2);
if (!SRC || !OUT || !PLATE || !RECT) {
  console.error('usage: node scripts/_inset_screen_glb.cjs <in.glb> <out.glb> <plateMaterial> <u0,v0,u1,v1> [dropNodes]');
  process.exit(1);
}
const [U0, V0, U1, V1] = RECT.split(',').map(Number);

const buf = fs.readFileSync(SRC);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binOff = 20 + jsonLen;
let bin = Buffer.from(buf.slice(binOff + 8, binOff + 8 + buf.readUInt32LE(binOff)));

if (DROP) {
  const names = DROP.split(',').map((x) => x.trim()).filter(Boolean);
  const before = json.scenes[0].nodes.length;
  json.scenes[0].nodes = json.scenes[0].nodes.filter((n) => !names.includes(json.nodes[n].name));
  console.log(`dropped ${before - json.scenes[0].nodes.length} node(s): ${names.join(', ')}`);
}

// ── locate the plate primitive ──────────────────────────────────────────────
let PM = -1, PP = -1;
json.meshes.forEach((m, mi) => m.primitives.forEach((pr, pi) => {
  if (PM < 0 && json.materials[pr.material] && json.materials[pr.material].name === PLATE) { PM = mi; PP = pi; }
}));
if (PM < 0) { console.error(`no primitive uses material "${PLATE}"`); process.exit(1); }

function readAcc(i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
  const nc = { VEC4: 4, VEC3: 3, VEC2: 2, SCALAR: 1 }[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || nc * 4;
  const out = [];
  for (let k = 0; k < a.count; k++) {
    const o = start + k * stride, v = [];
    for (let c = 0; c < nc; c++) v.push(bin.readFloatLE(o + c * 4));
    out.push(v);
  }
  return out;
}
const prim = json.meshes[PM].primitives[PP];
const POS = readAcc(prim.attributes.POSITION);
if (prim.attributes.TEXCOORD_0 == null) { console.error('the plate has no UVs to measure against'); process.exit(1); }
const UV = readAcc(prim.attributes.TEXCOORD_0);

// The plate is planar and axis-aligned, so u is a straight line in x and v in
// y — fit each independently and invert.
function fit(xs, ys) {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i]*xs[i]; sxy += xs[i]*ys[i]; }
  const a = (n*sxy - sx*sy) / (n*sxx - sx*sx);
  return [a, (sy - a*sx) / n];
}
const [au, bu] = fit(POS.map((p) => p[0]), UV.map((t) => t[0]));
const [av, bv] = fit(POS.map((p) => p[1]), UV.map((t) => t[1]));
const xOf = (u) => (u - bu) / au;
const yOf = (v) => (v - bv) / av;

const x0 = Math.min(xOf(U0), xOf(U1)), x1 = Math.max(xOf(U0), xOf(U1));
const y0 = Math.min(yOf(V0), yOf(V1)), y1 = Math.max(yOf(V0), yOf(V1));
const zPlate = POS.reduce((m, p) => Math.max(m, p[2]), -Infinity);
const z = zPlate + (x1 - x0) * 0.0006;      // just clear of the plate, scale-relative
console.log(`display: x ${x0.toFixed(4)}..${x1.toFixed(4)}  y ${y0.toFixed(4)}..${y1.toFixed(4)}`);
console.log(`         ${(x1-x0).toFixed(4)} x ${(y1-y0).toFixed(4)}  aspect ${((x1-x0)/(y1-y0)).toFixed(4)}  z ${z.toFixed(5)}`);

// ── trim the painted rail off the plate ─────────────────────────────────────
// A front-face photo does not stop at the bezel: it carries the phone's side
// rails, with the volume and power buttons painted onto them. The mesh has
// REAL rails and REAL buttons too, so keeping the whole plate shows both — two
// flat buttons along the front edge and the solid one beside them.
//
// The plate's UVs are linear in its positions, so pulling the vertices inward
// and re-deriving each UV from that same fit keeps the texture pinned exactly
// where it was and simply shows less of it. The rail falls outside the quad;
// the bezel, which is what the plate was restored for, stays.
const TRIM = process.argv[7];
if (TRIM) {
  const [tu0, tv0, tu1, tv1] = TRIM.split(',').map(Number);
  const tx0 = Math.min(xOf(tu0), xOf(tu1)), tx1 = Math.max(xOf(tu0), xOf(tu1));
  const ty0 = Math.min(yOf(tv0), yOf(tv1)), ty1 = Math.max(yOf(tv0), yOf(tv1));
  const bx = [Math.min(...POS.map((p) => p[0])), Math.max(...POS.map((p) => p[0]))];
  const by = [Math.min(...POS.map((p) => p[1])), Math.max(...POS.map((p) => p[1]))];
  const cx = (bx[0] + bx[1]) / 2, cy = (by[0] + by[1]) / 2;
  const kx = ((tx1 - tx0) / 2) / ((bx[1] - bx[0]) / 2);
  const ky = ((ty1 - ty0) / 2) / ((by[1] - by[0]) / 2);
  console.log(`trimming plate by x${kx.toFixed(4)} / y${ky.toFixed(4)} to drop the painted rail`);

  const pa = json.accessors[prim.attributes.POSITION];
  const pbv = json.bufferViews[pa.bufferView];
  const pStart = (pbv.byteOffset || 0) + (pa.byteOffset || 0);
  const pStride = pbv.byteStride || 12;
  const ta = json.accessors[prim.attributes.TEXCOORD_0];
  const tbv = json.bufferViews[ta.bufferView];
  const tStart = (tbv.byteOffset || 0) + (ta.byteOffset || 0);
  const tStride = tbv.byteStride || 8;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < pa.count; k++) {
    const o = pStart + k * pStride;
    const x = cx + (bin.readFloatLE(o) - cx) * kx;
    const y = cy + (bin.readFloatLE(o + 4) - cy) * ky;
    const z = bin.readFloatLE(o + 8);
    bin.writeFloatLE(x, o); bin.writeFloatLE(y, o + 4);
    // re-derive the UV from the ORIGINAL fit, so the texture stays put
    const t = tStart + k * tStride;
    bin.writeFloatLE(au * x + bu, t); bin.writeFloatLE(av * y + bv, t + 4);
    const v = [x, y, z];
    for (let c = 0; c < 3; c++) { if (v[c] < mn[c]) mn[c] = v[c]; if (v[c] > mx[c]) mx[c] = v[c]; }
  }
  if (pa.min) { pa.min = mn; pa.max = mx; }
}

// ── the display quad ────────────────────────────────────────────────────────
const verts = [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const pos = Buffer.alloc(4 * 12), nor = Buffer.alloc(4 * 12);
verts.forEach(([x, y], i) => {
  pos.writeFloatLE(x, i*12); pos.writeFloatLE(y, i*12+4); pos.writeFloatLE(z, i*12+8);
  nor.writeFloatLE(0, i*12); nor.writeFloatLE(0, i*12+4); nor.writeFloatLE(1, i*12+8);
});
const idx = Buffer.alloc(6 * 2);
[0,1,2, 0,2,3].forEach((v, i) => idx.writeUInt16LE(v, i*2));

function addView(b, target) {
  while (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(1)]);
  const off = bin.length;
  bin = Buffer.concat([bin, b]);
  json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(target ? { target } : {}) });
  return json.bufferViews.length - 1;
}
json.accessors.push({ bufferView: addView(pos, 34962), componentType: 5126, count: 4, type: 'VEC3',
  min: [x0, y0, z], max: [x1, y1, z] });
const aPos = json.accessors.length - 1;
json.accessors.push({ bufferView: addView(nor, 34962), componentType: 5126, count: 4, type: 'VEC3' });
const aNor = json.accessors.length - 1;
json.accessors.push({ bufferView: addView(idx, 34963), componentType: 5123, count: 6, type: 'SCALAR' });
const aIdx = json.accessors.length - 1;

// The plate keeps its texture but gives up the name, so the parts list does
// not show a "screen" next to the real "Screen".
json.materials[json.meshes[PM].primitives[PP].material].name = 'Front glass';
json.materials.push({ name: 'Screen',
  pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 0.35 } });
json.meshes.push({ name: 'Screen',
  primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor }, indices: aIdx, material: json.materials.length - 1 }] });
json.nodes.push({ name: 'Screen', mesh: json.meshes.length - 1 });
const screenNode = json.nodes.length - 1;
// The quad's coordinates come from the plate's own vertices, so it has to hang
// under the plate's node to inherit the same transform. Parked at the scene
// root instead it lands wherever the origin is — and these exports commonly
// translate the device sideways, which is exactly where it then draws.
const host = json.nodes.findIndex((n) => n.mesh === PM);
if (host >= 0) {
  (json.nodes[host].children ||= []).push(screenNode);
  console.log(`parented Screen under node "${json.nodes[host].name}"`);
} else {
  json.scenes[0].nodes.push(screenNode);
  console.log('no node carries the plate mesh — Screen added at the scene root');
}
console.log(`added Screen quad (material ${json.materials.length - 1}); plate "${PLATE}" left as authored`);

json.buffers[0].byteLength = bin.length;
let js = Buffer.from(JSON.stringify(json), 'utf8');
if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4), 0)]);
json.buffers[0].byteLength = bin.length;
js = Buffer.from(JSON.stringify(json), 'utf8');
if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004E4942, 4);
fs.writeFileSync(OUT, Buffer.concat([head, jh, js, bh, bin]));
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size/1048576).toFixed(1)} MB)`);
