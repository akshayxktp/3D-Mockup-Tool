// Prepares the iPhone 18 Pro device GLB from the raw AR asset, which ships the
// phone TWICE (a smaller and a larger body posed together for a product still).
// A device mesh must be one device, so this drops the BIGGER phone (root node
// "xHOyGAloVFtnQJe", 16.31 units tall, plus its "_1"-suffixed accessory copies)
// from the scene graph, keeping the smaller phone (node "ngEYGjaeUCsWWOR",
// 14.98 tall) and its base-named accessories. Mirrors _prep_device_glb.cjs.
const fs = require('fs');
const SRC = process.argv[2] || "/Users/akshaykumartp/Downloads/iphone-18-pro-p-sim.glb";
const OUT = process.argv[3] || "/Users/akshaykumartp/Documents/test 012/public/3d/devices/iphone18pro.glb";
const buf = fs.readFileSync(SRC);
const version = buf.readUInt32LE(4);
const jsonLen = buf.readUInt32LE(12);
const j = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
const binStart = 20 + jsonLen;
const binLen = buf.readUInt32LE(binStart);
const bin = buf.subarray(binStart + 8, binStart + 8 + binLen);

const scene = j.scenes[j.scene || 0];
const root = j.nodes[scene.nodes[0]];   // node#0 holds both phones as children
const REMOVE = new Set([119, 178, 181, 187, 200, 223]);   // bigger phone body + its _1 accessories
const before = root.children.slice();
root.children = root.children.filter((n) => !REMOVE.has(n));
console.log('root children before:', JSON.stringify(before));
console.log('root children after :', JSON.stringify(root.children));

let newJson = JSON.stringify(j);
while (newJson.length % 4 !== 0) newJson += ' ';
const jsonBuf = Buffer.from(newJson, 'utf8');
const binPad = (4 - (binLen % 4)) % 4;
const header = Buffer.alloc(12); header.write('glTF', 0, 'ascii'); header.writeUInt32LE(version, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binLen + binPad, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binLen + binPad, 0); bh.writeUInt32LE(0x004E4942, 4);
fs.writeFileSync(OUT, Buffer.concat([header, jh, jsonBuf, bh, bin, Buffer.alloc(binPad)]));
console.log('wrote', fs.statSync(OUT).size, 'bytes ->', OUT);
