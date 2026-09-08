// Convert a Wavefront OBJ + MTL pair into a GLB the Mockup section can load.
//
//   node scripts/_obj_to_device_glb.cjs <in.obj> <in.mtl> <out.glb> <screenObject/screenMaterial>
//
// The Mockup renderer is GLTFLoader-only and PBR, and an OBJ is neither: it
// carries a Blinn-Phong MTL (Ns/Ks/illum) with no metalness or roughness, so
// the material class has to be inferred rather than read. The mapping used
// here is the conventional one — specular exponent to roughness through
// roughness = sqrt(2/(Ns+2)), and MTL's illum 3 ("reflection on") as the
// signal for a metal. It is an approximation, and a device converted this way
// will not grade under the studio rig the way a natively-authored PBR mesh
// does; prefer a glTF source when there is one.
//
// The 4th argument names the display panel as "object/material" (both, since
// an OBJ object is usually split across several materials). That group's
// material is renamed to 'Screen', which is how three3d/mockup.ts finds the
// panel, and the whole model is rotated so the panel's own plane normal looks
// down +Z — the orientation the bundled devices are authored in, and the one
// ensureScreenUVs() needs to build a square planar unwrap.
const fs = require('fs');

const [OBJ, MTL, OUT, SCREEN] = process.argv.slice(2);
if (!OBJ || !MTL || !OUT || !SCREEN) {
  console.error('usage: node scripts/_obj_to_device_glb.cjs <in.obj> <in.mtl> <out.glb> <object/material>');
  process.exit(1);
}
const [SCR_OBJ, SCR_MTL] = SCREEN.split('/');

// ── MTL → PBR ───────────────────────────────────────────────────────────────
const mtl = new Map();
{
  let cur = null;
  for (const raw of fs.readFileSync(MTL, 'utf8').split('\n')) {
    const ln = raw.trim();
    if (ln.startsWith('newmtl ')) { cur = ln.slice(7).trim(); mtl.set(cur, { kd: [0.8, 0.8, 0.8], ns: 250, illum: 2, d: 1 }); }
    else if (!cur) continue;
    else if (ln.startsWith('Kd ')) mtl.get(cur).kd = ln.split(/\s+/).slice(1, 4).map(Number);
    else if (ln.startsWith('Ns ')) mtl.get(cur).ns = Number(ln.split(/\s+/)[1]);
    else if (ln.startsWith('d '))  mtl.get(cur).d = Number(ln.split(/\s+/)[1]);
    else if (ln.startsWith('illum ')) mtl.get(cur).illum = Number(ln.split(/\s+/)[1]);
    // map_Kd is deliberately ignored: OBJ texture paths are absolute paths on
    // the authoring machine and the image does not travel with the pair.
  }
}
// Ns -> roughness. NOT the textbook Blinn-Phong inverse sqrt(2/(Ns+2)): a
// Blender OBJ export does not write a Blinn-Phong exponent, it writes
//
//     Ns = 1000 * (1 - roughness)^2
//
// which the file proves on its own — several materials sit at exactly Ns 250,
// and 1000*(1-0.5)^2 = 250 is Blender's Principled default roughness of 0.5.
// Read as a Blinn-Phong exponent that same 250 comes out at 0.09, so every
// surface in the model lands near-mirror: it is what made a matte textile band
// (real roughness 0.73) render as wet-look rubber at 0.17.
// Per-material roughness overrides, "name=value,name=value". Classic MTL has
// no metalness or roughness of its own, so both are inferred here — and where
// the inferred value is simply wrong for the real surface (a bead-blasted
// titanium case reading as polished chrome), this is the way to say so.
// Unlike the Ns mapping above, an entry here is a deliberate override of what
// the file states, not a correction of how it was read.
const ROUGH_OVERRIDE = new Map(
  (process.argv[6] ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    .map((x) => { const [k, v] = x.split('='); return [k, Number(v)]; }));

const pbrOf = (name) => {
  const m = mtl.get(name) || { kd: [0.8, 0.8, 0.8], ns: 250, illum: 2, d: 1 };
  let rough = Math.min(1, Math.max(0.03, 1 - Math.sqrt(Math.min(1000, Math.max(0, m.ns)) / 1000)));
  if (ROUGH_OVERRIDE.has(name)) rough = ROUGH_OVERRIDE.get(name);
  return { kd: m.kd, rough, metal: m.illum >= 3 ? 1 : 0, alpha: m.d };
};

// ── OBJ ─────────────────────────────────────────────────────────────────────
const V = [], VN = [], VT = [];
const groups = new Map();                       // "obj|mtl" -> {obj, mtl, verts, index, map}
let obj = 'default', mat = 'default';
const gkey = () => obj + '|' + mat;
function group() {
  const k = gkey();
  if (!groups.has(k)) groups.set(k, { obj, mtl: mat, verts: [], index: [], map: new Map() });
  return groups.get(k);
}
const fix = (i, len) => (i < 0 ? len + i : i - 1);

for (const raw of fs.readFileSync(OBJ, 'utf8').split('\n')) {
  if (raw.startsWith('v '))       { const p = raw.split(/\s+/); V.push([+p[1], +p[2], +p[3]]); }
  else if (raw.startsWith('vn ')) { const p = raw.split(/\s+/); VN.push([+p[1], +p[2], +p[3]]); }
  else if (raw.startsWith('vt ')) { const p = raw.split(/\s+/); VT.push([+p[1], +p[2]]); }
  else if (raw.startsWith('o '))  obj = raw.slice(2).trim();
  else if (raw.startsWith('g ') && obj === 'default') obj = raw.slice(2).trim();
  else if (raw.startsWith('usemtl ')) mat = raw.slice(7).trim();
  else if (raw.startsWith('f ')) {
    const g = group();
    const corner = raw.slice(2).trim().split(/\s+/).map((tok) => {
      if (g.map.has(tok)) return g.map.get(tok);
      const [a, b, c] = tok.split('/');
      const vi = fix(parseInt(a, 10), V.length);
      const ti = b ? fix(parseInt(b, 10), VT.length) : -1;
      const ni = c ? fix(parseInt(c, 10), VN.length) : -1;
      const id = g.verts.length;
      g.verts.push({ p: V[vi], n: ni >= 0 && VN[ni] ? VN[ni] : null, t: ti >= 0 && VT[ti] ? VT[ti] : null });
      g.map.set(tok, id);
      return id;
    });
    for (let k = 1; k + 1 < corner.length; k++) g.index.push(corner[0], corner[k], corner[k + 1]);  // fan
  }
}

// ── rotation that puts the screen plane's normal on +Z ──────────────────────
const scr = groups.get(SCR_OBJ + '|' + SCR_MTL);
if (!scr) { console.error('no such group: ' + SCREEN + '\navailable:\n  ' + [...groups.keys()].join('\n  ')); process.exit(1); }
{
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const crs = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const acc = [0, 0, 0];
  for (let i = 0; i < scr.index.length; i += 3) {
    const [a, b, c] = [scr.verts[scr.index[i]].p, scr.verts[scr.index[i+1]].p, scr.verts[scr.index[i+2]].p];
    const n = crs(sub(b, a), sub(c, a));                 // area-weighted, so big faces win
    for (let k = 0; k < 3; k++) acc[k] += n[k];
  }
  var NRM = (() => { const l = Math.hypot(...acc); return acc.map((x) => x / l); })();
}
// Rotate NRM onto +Z about the axis perpendicular to both (Rodrigues).
const Z = [0, 0, 1];
const dot = NRM[0]*Z[0] + NRM[1]*Z[1] + NRM[2]*Z[2];
let R;
if (dot > 0.999999) R = [[1,0,0],[0,1,0],[0,0,1]];
else if (dot < -0.999999) R = [[1,0,0],[0,-1,0],[0,0,-1]];
else {
  const ax = [NRM[1]*Z[2]-NRM[2]*Z[1], NRM[2]*Z[0]-NRM[0]*Z[2], NRM[0]*Z[1]-NRM[1]*Z[0]];
  const s = Math.hypot(...ax), k = ax.map((x) => x / s), c = dot, t = 1 - c;
  R = [
    [t*k[0]*k[0]+c,       t*k[0]*k[1]-s*k[2], t*k[0]*k[2]+s*k[1]],
    [t*k[0]*k[1]+s*k[2],  t*k[1]*k[1]+c,      t*k[1]*k[2]-s*k[0]],
    [t*k[0]*k[2]-s*k[1],  t*k[1]*k[2]+s*k[0], t*k[2]*k[2]+c     ],
  ];
}
let rot = (v) => [R[0][0]*v[0]+R[0][1]*v[1]+R[0][2]*v[2], R[1][0]*v[0]+R[1][1]*v[1]+R[1][2]*v[2], R[2][0]*v[0]+R[2][1]*v[1]+R[2][2]*v[2]];
console.log(`screen plane normal [${NRM.map((x) => x.toFixed(4))}] -> +Z`);

// Aligning the normal fixes which way the device FACES but says nothing about
// which way is UP: the rotation that carries the normal onto +Z is only
// defined up to a spin about +Z, and the arbitrary one leaves the device
// rolled a few degrees off vertical. Solve the roll from the panel itself —
// the angle whose axis-aligned box around the screen is smallest is the one
// where the screen's own edges are horizontal and vertical.
{
  const pts = scr.verts.map((v) => rot(v.p));
  let best = { area: Infinity, a: 0 };
  for (let deg = 0; deg < 90; deg += 0.02) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const x = p[0]*c - p[1]*s, y = p[0]*s + p[1]*c;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (area < best.area) best = { area, a, w: x1 - x0, h: y1 - y0 };
  }
  // A watch/phone panel is taller than it is wide; if the fit landed on the
  // other diagonal, turn the quarter turn that stands it back up.
  let a = best.a;
  if (best.w > best.h) a += Math.PI / 2;
  const c = Math.cos(a), s = Math.sin(a), base = rot;
  rot = (v) => { const p = base(v); return [p[0]*c - p[1]*s, p[0]*s + p[1]*c, p[2]]; };
  console.log(`roll corrected by ${(a * 180 / Math.PI).toFixed(3)}deg about +Z`);
}

// ── build the glTF ──────────────────────────────────────────────────────────
const chunks = [], views = [], accessors = [], materials = [], meshes = [], nodes = [];
let byteLen = 0;
function push(buf, target) {
  while (byteLen % 4) { chunks.push(Buffer.alloc(1)); byteLen++; }
  const off = byteLen; chunks.push(buf); byteLen += buf.length;
  views.push(target == null ? { buffer: 0, byteOffset: off, byteLength: buf.length }
                            : { buffer: 0, byteOffset: off, byteLength: buf.length, target });
  return views.length - 1;
}
const matIndex = new Map();
function materialFor(name) {
  const isScreen = name === SCR_MTL;
  const key = isScreen ? 'Screen' : name;
  if (matIndex.has(key)) return matIndex.get(key);
  const p = pbrOf(name);
  const m = {
    name: key,
    pbrMetallicRoughness: {
      baseColorFactor: [...p.kd, p.alpha],
      metallicFactor: isScreen ? 0 : p.metal,
      roughnessFactor: isScreen ? 0.35 : p.rough,
    },
    doubleSided: true,
  };
  if (p.alpha < 1) m.alphaMode = 'BLEND';
  materials.push(m); matIndex.set(key, materials.length - 1);
  return materials.length - 1;
}

for (const g of groups.values()) {
  if (!g.index.length) continue;
  const n = g.verts.length;
  const isScreen = g === scr;
  const pos = Buffer.alloc(n * 12), nor = Buffer.alloc(n * 12);
  const hasUV = !isScreen && g.verts.some((v) => v.t);           // the panel's UVs are rebuilt in-app
  const uv = hasUV ? Buffer.alloc(n * 8) : null;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let anyN = false;
  g.verts.forEach((v, i) => {
    const p = rot(v.p);
    for (let c = 0; c < 3; c++) { pos.writeFloatLE(p[c], i*12 + c*4); if (p[c] < mn[c]) mn[c] = p[c]; if (p[c] > mx[c]) mx[c] = p[c]; }
    if (v.n) { anyN = true; const q = rot(v.n); const l = Math.hypot(...q) || 1;
      for (let c = 0; c < 3; c++) nor.writeFloatLE(q[c]/l, i*12 + c*4); }
    if (uv && v.t) { uv.writeFloatLE(v.t[0], i*8); uv.writeFloatLE(1 - v.t[1], i*8 + 4); }   // glTF UV origin is top-left
  });
  const big = n > 65535;
  const idx = big ? Buffer.alloc(g.index.length * 4) : Buffer.alloc(g.index.length * 2);
  g.index.forEach((v, i) => big ? idx.writeUInt32LE(v, i*4) : idx.writeUInt16LE(v, i*2));

  const attributes = {};
  accessors.push({ bufferView: push(pos, 34962), componentType: 5126, count: n, type: 'VEC3', min: mn, max: mx });
  attributes.POSITION = accessors.length - 1;
  if (anyN) { accessors.push({ bufferView: push(nor, 34962), componentType: 5126, count: n, type: 'VEC3' }); attributes.NORMAL = accessors.length - 1; }
  if (uv)   { accessors.push({ bufferView: push(uv, 34962),  componentType: 5126, count: n, type: 'VEC2' }); attributes.TEXCOORD_0 = accessors.length - 1; }
  accessors.push({ bufferView: push(idx, 34963), componentType: big ? 5125 : 5123, count: g.index.length, type: 'SCALAR' });

  meshes.push({ name: isScreen ? 'Screen' : `${g.obj}_${g.mtl}`,
    primitives: [{ attributes, indices: accessors.length - 1, material: materialFor(g.mtl) }] });
  nodes.push({ name: isScreen ? 'Screen' : `${g.obj}_${g.mtl}`, mesh: meshes.length - 1 });
}

const bin = Buffer.concat(chunks);
const json = { asset: { version: '2.0', generator: 'motion-studio _obj_to_device_glb.cjs' },
  scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, accessors,
  bufferViews: views, buffers: [{ byteLength: bin.length }] };

let js = Buffer.from(JSON.stringify(json), 'utf8');
if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
let bn = bin;
if (bn.length % 4) bn = Buffer.concat([bn, Buffer.alloc(4 - (bn.length % 4), 0)]);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bn.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bn.length, 0); bh.writeUInt32LE(0x004E4942, 4);
fs.writeFileSync(OUT, Buffer.concat([head, jh, js, bh, bn]));
console.log(`${meshes.length} meshes, ${materials.length} materials -> ${OUT} (${(fs.statSync(OUT).size/1048576).toFixed(1)} MB)`);
