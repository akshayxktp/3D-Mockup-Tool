const fs=require('fs');
// Apple Watch Ultra 3. The source (fetched from the reference tool at
// /models/apple-watch-ultra.glb) ships one mesh 'Cube.004' split into 12
// primitives, one material each. The active display is the primitive whose
// material is 'Material.004' — an emissive black panel — so this renames that
// material to 'Screen', the tag mockup.ts finds the screen mesh by (partKeyOf).
// The titanium case is 'Watch Body'/'Watch Crown'; the orange crown ring and
// band are left as authored so the Finish control never washes the accent out.
//
// It ALSO strips that primitive's TEXCOORD_0. Unlike the other bundled screen
// meshes (which ship no uv), this one carries authored UVs into an atlas
// sub-rect (u 0.31-0.68, v 0.19-0.65) — a MeshBasicMaterial map of the user's
// full-frame content sampled through them would show only that cropped corner.
// With the attribute gone, mockup.ts's ensureScreenUVs() projects clean planar
// 0-1 UVs from the quad instead, exactly as it does for every other device.
// The accessor (23) is used by no other primitive, so only this prim is touched.
const SRC="/Users/akshaykumartp/Documents/test 012/public/3d/devices/apple-watch-ultra.glb";
const buf=fs.readFileSync(SRC);
if(buf.toString('utf8',0,4)!=='glTF') throw new Error('not glb');
const version=buf.readUInt32LE(4);
const jsonLen=buf.readUInt32LE(12);
const jsonStr=buf.toString('utf8',20,20+jsonLen);
const j=JSON.parse(jsonStr);
const binChunkStart=20+jsonLen;
const binLen=buf.readUInt32LE(binChunkStart);
const bin=buf.subarray(binChunkStart+8, binChunkStart+8+binLen);

// --- edit 1: name the display material 'Screen' (idempotent)
let idx=j.materials.findIndex(m=>m.name==='Screen');
if(idx<0){
  idx=j.materials.findIndex(m=>m.name==='Material.004');
  if(idx<0) throw new Error("display material (Material.004/Screen) not found");
  j.materials[idx].name='Screen';
}
console.log('screen material is #'+idx+' ("'+j.materials[idx].name+'")');

// --- edit 2: strip the screen primitive's atlas UVs so ensureScreenUVs()
// regenerates planar 0-1 UVs for full-frame content.
const screenPrim=j.meshes[0].primitives.find(p=>p.material===idx);
if(!screenPrim) throw new Error("screen primitive not found");
if(screenPrim.attributes.TEXCOORD_0!=null){
  console.log('removing TEXCOORD_0 (accessor '+screenPrim.attributes.TEXCOORD_0+') from screen primitive');
  delete screenPrim.attributes.TEXCOORD_0;
} else {
  console.log('screen primitive already has no TEXCOORD_0');
}

let newJson=JSON.stringify(j);
while(newJson.length%4!==0) newJson+=' ';
const jsonBuf=Buffer.from(newJson,'utf8');
let binPad=(4-(binLen%4))%4;
const header=Buffer.alloc(12);
header.write('glTF',0,'ascii');
header.writeUInt32LE(version,4);
const totalLen=12 + 8+jsonBuf.length + 8+binLen+binPad;
header.writeUInt32LE(totalLen,8);
const jsonHeader=Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonBuf.length,0);
jsonHeader.writeUInt32LE(0x4E4F534A,4); // 'JSON'
const binHeader=Buffer.alloc(8);
binHeader.writeUInt32LE(binLen+binPad,0);
binHeader.writeUInt32LE(0x004E4942,4); // 'BIN\0'
const binPadBuf=Buffer.alloc(binPad);
const out=Buffer.concat([header,jsonHeader,jsonBuf,binHeader,bin,binPadBuf]);
fs.writeFileSync(SRC,out);
console.log('wrote',out.length,'bytes (was',buf.length,')');
const v=fs.readFileSync(SRC);const vl=v.readUInt32LE(12);const vj=JSON.parse(v.toString('utf8',20,20+vl));
console.log('verify material#'+idx+' name =',vj.materials[idx].name,'| materials',vj.materials.length,'| meshes',vj.meshes.length);
