import * as THREE from 'three';

// ── Studio environment for the Mockup stage ─────────────────────────────────
// A replacement for three's RoomEnvironment, which is a brightly-lit room on
// every side. That is fine for a matte prop and wrong for a phone: a device is
// mostly dark metal and glass, and those are MIRRORS. A camera ring authored at
// baseColor 0.011 with metalness 0.79 does not render black under a bright room
// — it renders back whatever surrounds it, which is why the Nothing Phone's
// lenses and Glyph matrix came out pale grey instead of black, and why Screen
// Glare had to ship at 0 to hide the room's rectangular panels.
//
// A real product shot is the opposite: a nearly black surround with a few large
// soft sources placed deliberately. Dark parts then stay dark, and every
// highlight is one you chose. That is what this builds.
export function studioEnvironment(): THREE.Scene {
  const env = new THREE.Scene();

  const box = new THREE.BoxGeometry();
  box.deleteAttribute('uv');
  const plane = new THREE.PlaneGeometry();
  plane.deleteAttribute('uv');

  // The surround. Near-black, not black: a touch of cool bounce keeps shadowed
  // metal from going dead flat, which reads as unlit rather than dark.
  const room = new THREE.Mesh(box, new THREE.MeshStandardMaterial({
    color: 0x0e1013, roughness: 1, metalness: 0, side: THREE.BackSide,
  }));
  room.scale.set(24, 16, 24);
  env.add(room);

  // Emissive cards, the way a studio actually works: a few big soft sources.
  // `emissiveIntensity` above 1 is what makes a panel read as a LIGHT rather
  // than a lit surface once PMREM convolves the scene.
  const card = (
    w: number, h: number, pos: [number, number, number],
    rot: [number, number, number], colour: number, intensity: number,
  ) => {
    const m = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: colour, emissiveIntensity: intensity,
      roughness: 1, metalness: 0, side: THREE.DoubleSide,
    }));
    m.scale.set(w, h, 1);
    m.position.set(...pos);
    m.rotation.set(...rot);
    env.add(m);
    return m;
  };

  const D = Math.PI / 180;

  // Key: a large soft box high and camera-left. Big and close, so its highlight
  // on a chamfer is a broad graded band rather than a hot dot.
  card(13, 9, [-6.5, 8.5, 5.5], [-52 * D, -26 * D, 0], 0xffffff, 5.2);

  // Overhead sweep. A curved surface — a camera ring, a chamfer — finds a
  // highlight from almost any source, because some part of it always faces one.
  // A flat panel does not: it shows only what sits in its mirror direction, so
  // a back glass aimed at the camera reflects whatever is directly behind the
  // camera and above it. With only the angled cards above, that direction was
  // empty and the back rendered as a dead matte slab while the lenses sparkled.
  // This is the big soft overhead a product shot puts there to lay a graded
  // sheen down the panel; it is wide and shallow-angled so the gradient runs
  // top-to-bottom across the device rather than pooling as a hotspot.
  card(20, 14, [0, 7.0, 9.5], [-24 * D, 0, 0], 0xffffff, 2.1);

  // And its quieter partner, low and in front: without a floor-level source the
  // bottom third of a vertical panel falls to black and the sheen reads as a
  // stripe instead of a sweep.
  card(16, 8, [0, -5.5, 8.5], [28 * D, 0, 0], 0xf4f7ff, 0.8);

  // Fill: wider, dimmer, cooler, opposite side — opens up the shadowed flank
  // without flattening it.
  card(14, 10, [8.5, 2.2, 3.5], [-8 * D, 58 * D, 0], 0xdfe8ff, 1.35);

  // Rim: behind and high, so the top edge and the rails separate from the
  // backdrop. This is the one that makes a phone read as a solid object.
  card(11, 4.5, [2.0, 7.5, -8.0], [46 * D, 12 * D, 0], 0xffffff, 3.0);

  // Floor bounce: a dim warm card below, standing in for the table a product
  // sits on. Keeps the underside from crushing to pure black.
  card(16, 16, [0, -7.5, 0], [-90 * D, 0, 0], 0xfff2e4, 0.5);

  // A narrow bright strip low and to the side. Real studios put a stripe like
  // this in to draw a specular line down a polished rail, and it is a large
  // part of why a product render looks machined rather than moulded.
  card(1.6, 12, [-9.0, -1.0, 1.5], [0, -78 * D, 0], 0xffffff, 2.6);

  return env;
}
