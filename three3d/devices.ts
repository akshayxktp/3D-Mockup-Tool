import * as THREE from 'three';
import { use3DStore } from '@/store/use3DStore';
import { MATTE_FINISHES } from './deviceFinishes';

// ── Device library (Mockup mode) ────────────────────────────────────────────
// Real device meshes + finish presets, mirrored from the reference tool's own
// device-lab registry (the product this feature is modelled after) so picking a
// device and a finish here behaves the way it does there. `fitHeight` is the
// reference's own tuned camera-fit size for each mesh — reused verbatim so each
// device frames correctly on first load.
export interface DeviceFinish {
  key: string;
  label: string;
  hex: string;
  // Exact per-MESH albedo for the finish, keyed by the mesh's prim name inside
  // the .usdz. Apple's own appearance layer (shipped in Matte, see
  // three3d/deviceFinishes.ts) works this way: a finish is a set of material
  // colours, not one tint applied to every "enclosure-ish" material. When
  // present, the generic enclosure heuristic in three3d/mockup.ts is skipped
  // and these colours are written straight onto the meshes.
  materialColors?: Record<string, string>;
  // Base-colour texture grades for finishes whose body maps carry the sheen
  // (mostly Apple's anodised frames). Same keys as materialColors.
  textureAdjustments?: Record<string, {
    exposure: number; brightness: number; contrast: number;
    saturation: number; hueDegrees: number;
  }>;
  // Metallic/roughness/clearcoat overrides for finishes that change the surface
  // itself rather than just its colour — Matte's Night Sky Duo band is
  // 0.8-metallic, and its 18 Pro blacks sit at 0.4. Keyed like materialColors.
  materialScalars?: Record<string, {
    metallic?: number; roughness?: number;
    clearcoat?: number; clearcoatRoughness?: number;
  }>;
}

// Which screen an uploaded asset belongs to. Assets are held PER SLOT, not per
// device, so one phone screenshot serves every phone and switching device keeps
// the right artwork on screen — the same model the reference tool uses.
export type ScreenSlot = 'phone' | 'laptop' | 'tablet' | 'display' | 'watch' | 'duoInner' | 'duoOuter';

export const SLOT_LABELS: Record<ScreenSlot, string> = {
  phone: 'Phone screen',
  laptop: 'Laptop screen',
  tablet: 'Tablet screen',
  display: 'Display screen',
  watch: 'Watch face',
  // The foldable Duo's two panels: the inner display (near-square, open) and
  // the narrow outer cover display — a phone screenshot fits neither.
  duoInner: 'Inner display',
  duoOuter: 'Outer cover screen',
};

// A second (or third) display on the same device — for a future multi-panel
// device (e.g. a foldable). These are IMAGE-ONLY: video playback, the
// status-bar overlay and the export video pipeline all drive the PRIMARY screen
// (see three3d/mockup.ts), which stays exactly as it was for every other device.
export interface ExtraScreenDef {
  slot: ScreenSlot;
  materialName: string;     // the GLB material tagging this panel's quad(s)
  screenAspect: number;
  screenCornerFrac: number;
  screenPx: [number, number];
  screenTextureFlipY?: boolean;
  // A left|right mirror, independent of screenTextureFlipY's top|bottom flip
  // — this panel's own planar UV unwrap can run either axis backwards from
  // the primary screen's, since it's a geometrically separate quad.
  screenTextureFlipX?: boolean;
  // A panel that sits flush against a hinge/spine on one side is square there
  // and only rounded on the real outer edge — unlike every rigid device's
  // screen, whose corner radius is uniform on all four corners. Names the
  // edge whose two corners stay sharp; omit for a normal uniform radius.
  screenSharpEdge?: 'left' | 'right' | 'top' | 'bottom';
}

export interface DeviceDef {
  key: string;
  label: string;
  // Listed under the picker's "New Devices" section rather than the main
  // library. The flag lives on the device, not in the panel, so a saved
  // project still resolves its model through the same single DEVICES array.
  isNew?: boolean;
  modelUrl: string;        // local copy, served from /public/3d/devices
  fitHeight: number;       // world-size the model is fitted to (see three3d/frame.ts)
  screenAspect: number;    // the "Screen" mesh's own w/h — used to cover-fit uploaded media
  screenCornerFrac: number; // corner radius as a fraction of the screen's short side
  screenTextureFlipY?: boolean; // bundled meshes do not all share the same UV vertical direction
  screenTextureFlipX?: boolean; // a left|right mirror, independent of the vertical flip above
  screenTextureRotate180?: boolean; // some quads author their UVs rotated a half-turn (content lands upside-down)
  // Some bundled meshes were authored with the screen's UV axes SWAPPED, which
  // lands the content sideways — and mirrored, because swapping axes is a
  // reflection, not a rotation. `screenTextureFlipY` cannot express that. The
  // fix reflects the composite back along the same diagonal ('main': u<->v) or
  // the anti-diagonal ('anti'), which is self-inverse, so applying the measured
  // reflection cancels it. Measured per device with an orientation target —
  // see scripts/_probe_screen_orientation.cjs.
  screenTextureTranspose?: 'main' | 'anti';
  statusBarScaleX?: number; // compensates authored screen-UV stretching for the system overlay only
  // Which material tags the PRIMARY screen. Defaults to 'Screen'. A device
  // whose panel is more than one quad sharing a texture (e.g. a foldable inner
  // display split left|right) can point this at a shared material name — the
  // primary screen binding is a LIST of meshes, not a single one.
  screenMaterial?: string;
  extraScreens?: ExtraScreenDef[];
  // Name of the animation clip (three3d/gltfCache.ts preserves GLTFLoader's
  // parsed clips) that opens/closes a rigged foldable. Scrubbed by the Duo
  // Fold slider (0-100%) rather than played back — see three3d/mockup.ts.
  // Devices with no clip of this name simply have no fold control.
  foldAnimationClip?: string;
  // The clip's own time axis may run closed→open rather than open→closed;
  // set this when 100% on the slider needs to map to time 0 instead of the
  // clip's end.
  foldAnimationReverse?: boolean;
  // Fixed-pose AR Duo: bend its mesh vertices around the model-space hinge.
  foldGeometryHinge?: boolean;
  // A one-time correction applied to the model before it's fitted, for a
  // source authored lying flat (screen normal along +Y) rather than in this
  // library's own standing convention (screen normal along +Z). Every
  // converted device already has this baked into its GLB; this exists for a
  // source used as-is, like the Duo's rigged product-viewer asset.
  baseRotationX?: number;
  // Same idea for a source rolled or spun about another axis. An AR Quick Look
  // package is exported in whatever pose Apple photographed the product in —
  // the iPhone Air, for one, ships with its screen facing +X — so the device
  // library carries the correction rather than editing the asset.
  baseRotationY?: number;
  baseRotationZ?: number;
  // AR Quick Look packages routinely ship the product TWICE (two sizes, or a
  // front-facing and a back-facing copy). `hideNodes` drops named subtrees and
  // `hideBox` drops every mesh whose centre falls inside this model-space box,
  // for packages whose two copies share node names. Both are applied before
  // the model is fitted and before materials are collected, so the hidden copy
  // never reaches the screen binding, the part picker or the material list.
  hideNodes?: string[];
  hideBox?: [number, number, number, number, number, number];
  slot: ScreenSlot;
  // The panel's real native pixels, shown in the UI so a screenshot can be
  // prepared at the right size. Verified against Apple's own tech specs.
  screenPx: [number, number];
  finishes: DeviceFinish[];
}

export const DEVICES: DeviceDef[] = [
  {
    key: 'applehomeview', label: 'Apple HomeView', modelUrl: '/3d/devices/apple-homeview.usdz', fitHeight: 1.8,
    screenAspect: 1.778, screenCornerFrac: 0.035, slot: 'display', screenPx: [3840, 2160],
    finishes: [{ key: 'silver', label: 'Silver', hex: '#d8d8da' }],
  },
  {
    key: 'iphone17pro', label: 'iPhone 17 Pro', modelUrl: '/3d/devices/iphone17pro-clean.glb', fitHeight: 2.077,
    screenAspect: 0.462, screenCornerFrac: 0.151, slot: 'phone', screenPx: [1206, 2622],
    // Cosmic Orange stays first: markEnclosureMaterials() in three3d/mockup.ts
    // treats finishes[0] as the colour the mesh was authored in, and finds the
    // enclosure by matching that hue. Reordering this list would break the
    // recolouring for every finish.
    finishes: [
      { key: 'cosmic', label: 'Cosmic Orange', hex: '#db6018' },
      { key: 'silver', label: 'Silver', hex: '#d9dadc' },
      { key: 'blue', label: 'Deep Blue', hex: '#2c3a4f' },
      { key: 'skyblue', label: 'Sky Blue', hex: '#8aaedb' },
      { key: 'plum', label: 'Plum', hex: '#712c4e' },
      { key: 'black', label: 'Black', hex: '#1f2022' },
    ],
  },
  {
    key: 'iphoneair', label: 'iPhone Air', modelUrl: '/3d/devices/iphoneair.glb', fitHeight: 2.077,
    screenAspect: 0.46, screenCornerFrac: 0.124, screenTextureFlipY: false, statusBarScaleX: 0.9, slot: 'phone', screenPx: [1260, 2736],
    finishes: [
      { key: 'skyblue', label: 'Sky Blue', hex: '#a9c3d6' },
      { key: 'black', label: 'Black', hex: '#1f2022' },
    ],
  },
  {
    // The mesh is authored at real scale (its 16.06 units are the phone's
    // 160.6 mm), and `fitHeight` keeps that: 2.23 is 160.6 mm at the same
    // 72 mm-per-world-unit the iPhone 17 Pro's 2.077 sets for 149.6 mm, so the
    // two phones stand in correct proportion to each other on the stage.
    key: 'nothingphone3', label: 'Nothing Phone (3)', modelUrl: '/3d/devices/nothingphone3-clean.glb', fitHeight: 2.23,
    screenAspect: 0.456, screenCornerFrac: 0.098, slot: 'phone', screenPx: [1260, 2800],
    // White only, and deliberately.
    //
    // This mesh carries exactly one back texture, the white variant's, and
    // everything that makes the back read — the plate tones, the silkscreen,
    // the red accent square — lives in that image rather than in geometry or
    // material colour. The Finish control works by re-hueing material colour,
    // which multiplies the map: going to black drives the whole texture to
    // black and takes the red square and the plate edges with it. The real
    // black Phone (3) is not the white one tinted, it ships a different back
    // texture altogether.
    //
    // A Black swatch here can therefore look wrong but never right, so it is
    // not offered. Add one when a black-variant texture is available; the
    // ENCLOSURE_BY_MATERIAL entry in three3d/mockup.ts already resolves this
    // device's body correctly and is what such a variant would build on.
    finishes: [
      { key: 'white', label: 'White', hex: '#f2f2f2' },
    ],
  },
  {
    // The source file ships the phone TWICE — a second copy turned 180 degrees
    // so a product still can show front and back together. A device mesh has
    // to be one device, so scripts/_prep_device_glb.cjs drops the reversed
    // copy (`phone.001`) from the scene; without that, fitAndCenter would
    // frame the pair and the phone would sit off to one side.
    key: 'nothingphone4apro', label: 'Nothing Phone (4a) Pro', modelUrl: '/3d/devices/nothingphone4apro-clean.glb', fitHeight: 2.27,
    // This mesh has no display geometry at all: its whole front is ONE quad
    // whose texture paints the rail, the bezel, the punch-hole camera and a
    // wallpaper together. Pointed at that plate, the app's artwork covered the
    // entire face and took the bezel and camera with it. So the plate stays as
    // authored and scripts/_inset_screen_glb.cjs lays a separate quad over
    // just the active display, measured off that texture — the numbers below
    // are that quad's, and its 0.451 is a real phone ratio where the plate's
    // was 0.474.
    screenAspect: 0.451, screenCornerFrac: 0.098, slot: 'phone', screenPx: [1080, 2400],
    finishes: [
      { key: 'white', label: 'White', hex: '#f2f2f2' },
      { key: 'black', label: 'Black', hex: '#1d1d1f' },
    ],
  },
  {
    key: 'macbook14', label: 'MacBook Pro 14"', modelUrl: '/3d/devices/macbook14-clean.glb', fitHeight: 1.3,
    screenAspect: 1.538, screenCornerFrac: 0.0086, screenTextureFlipY: false, slot: 'laptop', screenPx: [3024, 1964],
    finishes: [
      { key: 'spaceblack', label: 'Space Black', hex: '#565457' },
      { key: 'silver', label: 'Silver', hex: '#c6c7c8' },
    ],
  },
  {
    key: 'ipadpro', label: 'iPad Pro', modelUrl: '/3d/devices/ipadpro.glb', fitHeight: 1.7,
    screenAspect: 1.33, screenCornerFrac: 0.014, screenTextureTranspose: 'anti', slot: 'tablet', screenPx: [2752, 2064],
    // Space Black first, and it has to stay first: markEnclosureMaterials()
    // treats finishes[0] as the colour the mesh was authored in. Silver led
    // this list, and the mesh is not silver — its rear shell samples to
    // lightness 0.05 against Silver's 0.57, so every enclosure material fell
    // outside the match band and the Finish control repainted nothing at all
    // (4 of 63 materials matched, none of them the body).
    finishes: [
      { key: 'spaceblack', label: 'Space Black', hex: '#565457' },
      { key: 'silver', label: 'Silver', hex: '#c6c7c8' },
    ],
  },
  {
    key: 'ipadair', label: 'iPad Air', modelUrl: '/3d/devices/ipadair.glb', fitHeight: 1.7,
    screenAspect: 1.34, screenCornerFrac: 0.007, screenTextureTranspose: 'main', slot: 'tablet', screenPx: [2732, 2048],
    finishes: [{ key: 'blue', label: 'Blue', hex: '#8f9fb5' }],
  },
  {
    key: 'displayxdr', label: 'Pro Display XDR', modelUrl: '/3d/devices/displayxdr.glb', fitHeight: 1.5,
    screenAspect: 1.778, screenCornerFrac: 0, slot: 'display', screenPx: [6016, 3384],
    finishes: [{ key: 'silver', label: 'Silver', hex: '#c6c7c8' }],
  },
  {
    key: 'studiodisplay', label: 'Studio Display', modelUrl: '/3d/devices/studiodisplay.glb', fitHeight: 1.5,
    screenAspect: 1.78, screenCornerFrac: 0.012, screenTextureFlipY: false, slot: 'display', screenPx: [5120, 2880],
    finishes: [{ key: 'silver', label: 'Silver', hex: '#d8d8da' }],
  },
  {
    key: 'applewatch', label: 'Apple Watch Series 5', modelUrl: '/3d/devices/applewatch-clean.glb', fitHeight: 1.9,
    screenAspect: 0.821, screenCornerFrac: 0.185, slot: 'watch', screenPx: [368, 448],
    // Silver stays first for the same reason Cosmic Orange does on the 17 Pro:
    // markEnclosureMaterials() reads finishes[0] as the colour the case was
    // authored in. It must also stay a TRUE neutral: that function only takes
    // the unsaturated match path when the shipped hex's own saturation is
    // below 0.1, and the case's authored aluminium (linear .9405/.9437/.95) is
    // faintly blue — spelling it as #f8f9fa reads as s 0.16, sends the match
    // down the hue path instead, and the Finish control then repaints nothing.
    finishes: [
      { key: 'silver', label: 'Silver', hex: '#f9f9f9' },
      { key: 'spacegray', label: 'Space Gray', hex: '#57534e' },
      { key: 'gold', label: 'Gold', hex: '#e8cbb8' },
      { key: 'spaceblack', label: 'Space Black', hex: '#3b3b3d' },
    ],
  },
  {
    // Converted from an OBJ/MTL pair by scripts/_obj_to_device_glb.cjs, so it
    // carries none of the PBR the other meshes are authored with — the
    // metalness and roughness here are inferred from the MTL's Blinn-Phong
    // exponent, not read, and it grades flatter under the studio rig as a
    // result. The panel is a stylised one rather than a measured one: 0.836
    // with corners at 29% of the short side, against the real Series 5's 0.821
    // and ~18%. `screenPx` states THIS mesh's own ratio rather than Apple's
    // published one, since the number's whole job in the UI is to say what
    // size to prepare artwork at.
    key: 'applewatchfabric', label: 'Apple Watch (fabric band)', modelUrl: '/3d/devices/applewatch-fabric.glb', fitHeight: 1.9,
    screenAspect: 0.836, screenCornerFrac: 0.29, slot: 'watch', screenPx: [368, 440],
    // Same rule as the Series 5 above, and this mesh is the strict case for it.
    // Its `watch_metal` is a warm grey (linear .521/.495/.420) whose own
    // saturation is .107 — under MIN_SAT — so the hue path can never match it,
    // and the neutral path only runs when finishes[0] is itself below s .1.
    // Titanium is therefore spelled as a true grey at that metal's lightness:
    // it is the authored colour, and the only entry that makes the other three
    // reachable at all.
    finishes: [
      { key: 'titanium', label: 'Titanium', hex: '#b6b6b6' },
      { key: 'silver', label: 'Silver', hex: '#dcdcdc' },
      { key: 'graphite', label: 'Graphite', hex: '#6f6f6f' },
      { key: 'spaceblack', label: 'Space Black', hex: '#3f3f3f' },
    ],
  },
  {
    // Apple Watch Ultra 3. Fetched from the reference tool's own library
    // (/models/apple-watch-ultra.glb). One mesh, 12 primitives; the display is
    // the primitive whose material scripts/_tag_ultra_screen.cjs renames to
    // 'Screen'. screenAspect is that quad's measured 0.706/0.854.
    //
    // finishes[0] MUST stay a TRUE neutral (s < 0.1), same rule as the Series 5
    // and fabric watches above. The case's authored titanium is a WARM grey
    // (#c6beb6, s ~0.12): spelled literally it reads as saturated, so
    // markEnclosureMaterials() takes the hue path and — the case hue being warm
    // orange — sweeps in the Ultra's orange crown ring and band, which the
    // Finish then repaints along with the case. Spelling it #bdbdbd sends the
    // match down the unsaturated path, which the orange accents can never hit.
    // The real warm titanium still shows at rest: picking this finish is a no-op
    // (isFinished is false when the pick equals finishes[0]) so the authored
    // material is shown unchanged. ENCLOSURE_BY_MATERIAL in three3d/mockup.ts
    // then names 'Watch Body'/'Watch Crown' so the case repaints reliably.
    key: 'applewatchultra3', label: 'Apple Watch Ultra 3', modelUrl: '/3d/devices/apple-watch-ultra.glb', fitHeight: 1.9,
    screenAspect: 0.826, screenCornerFrac: 0.16, slot: 'watch', screenPx: [410, 502],
    finishes: [
      { key: 'titanium', label: 'Natural Titanium', hex: '#bdbdbd' },
      { key: 'black', label: 'Black Titanium', hex: '#3b3b3d' },
    ],
  },
  {
    // iPhone 18 Pro. The raw AR asset ships the phone twice (a smaller and a
    // larger body posed together); scripts/_prep_iphone18_glb.cjs drops the
    // larger one, keeping this body. The display active-area quad is the mesh
    // whose material was renamed 'Screen'. screenAspect is the panel's measured
    // 6.67/14.45 (a real iPhone 0.46). The quad's front faces -Z, so its screen
    // UVs run the opposite vertical direction and uploaded content lands flipped
    // top-to-bottom; screenTextureFlipY:false cancels exactly that (same as the
    // MacBook). No rotate180 — pairing it with the flipY toggle double-corrects
    // into a horizontal mirror.
    key: 'iphone18pro', label: 'iPhone 18 Pro', modelUrl: '/3d/devices/iphone18pro.glb', fitHeight: 2.077,
    screenAspect: 0.462, screenCornerFrac: 0.13, screenTextureFlipY: false, slot: 'phone', screenPx: [1206, 2622],
    finishes: [
      { key: 'silver', label: 'Silver', hex: '#d9dadc' },
      { key: 'black', label: 'Black', hex: '#1f2022' },
    ],
  },
  {
    // iPhone Duo (folding). Unlike the other bundled devices, this is not a
    // converted AR Quick Look asset — Apple's own USDZ for this product turned
    // out to be a single fused closed-pose scan with no hinge to animate (see
    // git history for that investigation). This is instead Apple's own
    // INTERACTIVE PRODUCT-VIEWER asset — a properly rigged, skinned glTF with
    // a real 'Slider' animation clip driving the fold, the same widget behind
    // the "drag to fold" control on the product page. It ships as loose glTF
    // + .bin + per-material .avif textures (not one .glb) in
    // public/3d/devices/duo/ — GLTFLoader handles that layout natively.
    //
    // Both screens are tagged by material name, same convention as every
    // other device: 'ScreenInner' (mesh 'skeleton_0_3_screenTexture_geo') is
    // the open inner display, 'Screen' (mesh
    // 'skeleton_0_7_outerDisplayScreenTexture_geo') is the outer cover — both
    // renamed from their authored hashes, and both had their authored
    // TEXCOORDs dropped so ensureScreenUVs() builds the planar unwrap the
    // canvas compositor needs, exactly as scripts/_prep_device_glb.cjs does
    // for a converted device.
    //
    // screenAspect for each is the panel's own bind-pose bounding box (X/Z,
    // since the rig's rest pose lies flat): inner 15.78/11.03 ≈ 1.43 (matches
    // the open display being wider than tall), outer 7.73/11.18 ≈ 0.69 (the
    // narrow portrait cover).
    key: 'iphoneduo', label: 'iPhone Duo', modelUrl: '/3d/devices/duo/product-viewer.gltf', fitHeight: 2.3,
    screenAspect: 1.43, screenCornerFrac: 0.05, screenTextureFlipY: false, slot: 'duoInner', screenPx: [2960, 2072],
    screenMaterial: 'ScreenInner',
    foldAnimationClip: 'Slider',
    baseRotationX: 90,
    extraScreens: [
      // Its left edge is the hinge spine: square there, rounded only on the
      // free outer edge, the way the real cover panel is cut.
      { slot: 'duoOuter', materialName: 'Screen', screenAspect: 0.69, screenCornerFrac: 0.09, screenPx: [1080, 1562], screenTextureFlipY: false, screenTextureFlipX: true, screenSharpEdge: 'left' },
    ],
    finishes: [
      // Matte ships two: the authored Star White and a dark navy Night Sky.
      // The rig's GLB predates the appearance layer, so Night Sky goes through
      // the neutral-finish remap rather than an exact per-mesh table; the AR
      // Duo in New Devices carries Matte's exact thirteen-panel colours.
      { key: 'starwhite', label: 'Star White', hex: '#F2F2F2' },
      { key: 'night-sky', label: 'Night Sky', hex: '#0D2130' },
    ],
  },

  // ── New Devices ──────────────────────────────────────────────────────────
  // Straight from Apple's own AR Quick Look packages (the .usdz files Apple
  // serves on each product page). They are loaded as authored, through the
  // same USD path as the HomeView above, with three corrections recorded here
  // rather than baked into the assets:
  //
  //   · each display is tagged by its own mesh name — a USD package carries no
  //     material names at all, so partKeyOf() falls back to the mesh name;
  //   · duplicated copies (Apple ships two sizes, or front and back, in some
  //     packages) are dropped with hideNodes / hideBox;
  //   · a pose correction, measured from the display's own surface normals,
  //     squares each device up. DELIBERATELY absent for the laptops and the
  //     iPad-on-keyboard: those screens genuinely face up and back at ~20-30°
  //     and the existing MacBook Pro 14" GLB holds the same tilt, so squaring
  //     them would tip the keyboard off the ground.
  //
  // These AR meshes ship in a single finish, so each lists exactly one — the
  // Finish control then shows the authored colour and never repaints (see
  // isFinished in three3d/mockup.ts, which treats finishes[0] as "leave be").
  {
    key: 'iphone17ar', label: 'iPhone 17', isNew: true, modelUrl: '/3d/devices/iphone-17-e-sim.usdz', fitHeight: 2.077,
    screenAspect: 0.459, screenCornerFrac: 0.13, slot: 'phone', screenPx: [1206, 2622],
    screenMaterial: 'eXcdWRctfHqyWLU',
    finishes: MATTE_FINISHES.iphone17,
  },
  {
    // Apple's package ships this phone TWICE — a Pro and a Pro Max, back to
    // back. The copy facing +Z is the one kept; the other is dropped by its
    // subtree name. screenMaterial resolves after the drop, leaving one panel.
    key: 'iphone17proar', label: 'iPhone 17 Pro (AR)', isNew: true, modelUrl: '/3d/devices/iphone-17-pro-e-sim.usdz', fitHeight: 2.077,
    screenAspect: 0.462, screenCornerFrac: 0.13, slot: 'phone', screenPx: [1206, 2622],
    screenMaterial: 'HkNSnYzBPABcqwM',
    hideNodes: ['RQNEPvSqUMnJxkk'],
    finishes: MATTE_FINISHES.iphone17pro,
  },
  {
    // Same two copies as the 17 Pro, but here they share node names, so the
    // extra one is dropped by position instead — a plane in front of the copy
    // whose display faces +Z.
    key: 'iphone18proar', label: 'iPhone 18 Pro (AR)', isNew: true, modelUrl: '/3d/devices/iphone-18-pro-e-sim.usdz', fitHeight: 2.077,
    screenAspect: 0.462, screenCornerFrac: 0.13, slot: 'phone', screenPx: [1206, 2622],
    screenMaterial: 'EHjrGDHNHzgNjtE',
    hideBox: [-99, 99, -99, 99, 0.7, 99],
    finishes: MATTE_FINISHES.iphone18pro,
  },
  {
    // Exported with its screen facing +X; a quarter turn about Y stands it up.
    key: 'iphoneairar', label: 'iPhone Air (AR)', isNew: true, modelUrl: '/3d/devices/iphone-air-e-sim.usdz', fitHeight: 2.077,
    screenAspect: 0.46, screenCornerFrac: 0.124, slot: 'phone', screenPx: [1260, 2736],
    screenMaterial: 'tppzCQmnlKcHIpP',
    baseRotationY: 90,
    finishes: MATTE_FINISHES.iphoneair,
  },
  {
    // On its Magic Keyboard, open at the keyboard's own working angle (~30°).
    // Left as authored for the reason above; fitHeight is a little larger than
    // the tablet entries because the open unit's longest axis is its depth.
    key: 'ipadpro13m4black', label: 'iPad Pro 13″ (M4, Black)', isNew: true, modelUrl: '/3d/devices/ipad-pro-13-M4-black.usdz', fitHeight: 1.75,
    screenAspect: 1.333, screenCornerFrac: 0.014, slot: 'tablet', screenPx: [2752, 2064],
    screenMaterial: 'ifuqiaWvBiLVOJa',
    finishes: [{ key: 'spaceblack', label: 'Space Black', hex: '#1d1d1f' }],
  },
  {
    key: 'ipadpro13m4silver', label: 'iPad Pro 13″ (M4, Silver)', isNew: true, modelUrl: '/3d/devices/ipad-pro-13-M4-silver.usdz', fitHeight: 1.75,
    screenAspect: 1.333, screenCornerFrac: 0.014, slot: 'tablet', screenPx: [2752, 2064],
    screenMaterial: 'AuxUZFpIdyYVcpo',
    finishes: [{ key: 'silver', label: 'Silver', hex: '#c6c7c8' }],
  },
  {
    key: 'macbookpro14m4', label: 'MacBook Pro 14″ (M4)', isNew: true, modelUrl: '/3d/devices/macbook-pro-14-2024-M4-space-black.usdz', fitHeight: 1.3,
    screenAspect: 1.54, screenCornerFrac: 0.0086, slot: 'laptop', screenPx: [3024, 1964],
    screenMaterial: 'YdXejmlVmqnwRvk',
    finishes: [{ key: 'spaceblack', label: 'Space Black', hex: '#565457' }],
  },
  {
    key: 'macbookpro14m5', label: 'MacBook Pro 14″ (2025)', isNew: true, modelUrl: '/3d/devices/macbook-pro-14-2025-space-black.usdz', fitHeight: 1.3,
    screenAspect: 1.54, screenCornerFrac: 0.0086, slot: 'laptop', screenPx: [3024, 1964],
    screenMaterial: 'tfTbkkzhxqpKRgC',
    finishes: [{ key: 'spaceblack', label: 'Space Black', hex: '#565457' }],
  },
  {
    // 16" is 14% wider than the 14"; the same 1.3 fit would shrink it to the
    // same on-screen width, so the fit scales with the real width.
    key: 'macbookpro16m4', label: 'MacBook Pro 16″ (M4)', isNew: true, modelUrl: '/3d/devices/macbook-pro-16-2024-M4-space-black.usdz', fitHeight: 1.48,
    screenAspect: 1.547, screenCornerFrac: 0.0086, slot: 'laptop', screenPx: [3456, 2234],
    screenMaterial: 'NbrsdUjHEUCinvO',
    finishes: [{ key: 'spaceblack', label: 'Space Black', hex: '#565457' }],
  },
  {
    key: 'imac24', label: 'iMac 24″', isNew: true, modelUrl: '/3d/devices/imac-24-silver.usdz', fitHeight: 1.5,
    screenAspect: 1.778, screenCornerFrac: 0.012, slot: 'display', screenPx: [4480, 2520],
    screenMaterial: 'HVXqYfVCwGuzJFM',
    baseRotationX: 8,
    finishes: [{ key: 'silver', label: 'Silver', hex: '#d8d8da' }],
  },
  {
    key: 'studiodisplayar', label: 'Studio Display (AR)', isNew: true, modelUrl: '/3d/devices/studio-display.usdz', fitHeight: 1.5,
    screenAspect: 1.778, screenCornerFrac: 0.012, slot: 'display', screenPx: [5120, 2880],
    screenMaterial: 'IZJsAfohLAwOHok',
    finishes: [{ key: 'silver', label: 'Silver', hex: '#d8d8da' }],
  },
  {
    // Apple's AR package carries the original band, hinge and camera materials.
    // Its open pose has no animation clip, so the fold slider bends its right
    // half around the authored centre seam in model coordinates.
    key: 'iphoneduoar', label: 'iPhone Duo (AR)', isNew: true, modelUrl: '/3d/devices/iPhone_Duo_e-sim_Star-White_Variant.usdz', fitHeight: 2.3,
    screenAspect: 1.42, screenCornerFrac: 0.05, slot: 'duoInner', screenPx: [2960, 2072],
    screenMaterial: 'UXtsBZYlaUvHoEh',
    baseRotationX: 90,
    foldGeometryHinge: true,
    finishes: MATTE_FINISHES.iphoneduo,
  },
  {
    // The AR watches are posed on their bands, face tilted 35° up. Squared up
    // here so the face reads straight on, the way the bundled Ultra 3 GLB is.
    key: 'applewatchseries11', label: 'Apple Watch Series 11', isNew: true, modelUrl: '/3d/devices/watch-series-11.usdz', fitHeight: 1.9,
    screenAspect: 0.839, screenCornerFrac: 0.17, slot: 'watch', screenPx: [416, 496],
    screenMaterial: 'stReeZuRtRzZwdd',
    baseRotationX: 35,
    finishes: MATTE_FINISHES.watchs11,
  },
  {
    key: 'applewatchultra3ar', label: 'Apple Watch Ultra 3 (AR)', isNew: true, modelUrl: '/3d/devices/watch-ultra-3.usdz', fitHeight: 1.9,
    screenAspect: 0.821, screenCornerFrac: 0.16, slot: 'watch', screenPx: [422, 514],
    screenMaterial: 'LBTKGOnjodxPkhe',
    baseRotationX: 35,
    finishes: MATTE_FINISHES.watchultra3,
  },
];

export function findDevice(modelUrl: string | null | undefined): DeviceDef | undefined {
  return DEVICES.find((d) => d.modelUrl === modelUrl);
}

// Everything a device needs done to the raw asset before it is fitted, posed or
// rendered: drop the extra copies some AR packages ship, then apply the pose
// correction. Shared by the main stage (three3d/mockup.ts) and the preset
// thumbnails (components/MockupThumb.tsx) so a thumbnail can never show two
// phones where the stage shows one.
export function prepareDeviceModel(root: THREE.Object3D, dev: DeviceDef | undefined): void {
  if (!dev) return;
  if (dev.hideNodes?.length) {
    const drop: THREE.Object3D[] = [];
    root.traverse((o) => { if (o.name && dev.hideNodes!.includes(o.name)) drop.push(o); });
    for (const o of drop) o.removeFromParent();
  }
  if (dev.hideBox) {
    const [x0, x1, y0, y1, z0, z1] = dev.hideBox;
    const box = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    root.updateMatrixWorld(true);
    const drop: THREE.Object3D[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (box.containsPoint(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()))) drop.push(o);
    });
    for (const o of drop) o.removeFromParent();
  }
  root.rotation.set(
    THREE.MathUtils.degToRad(dev.baseRotationX ?? 0),
    THREE.MathUtils.degToRad(dev.baseRotationY ?? 0),
    THREE.MathUtils.degToRad(dev.baseRotationZ ?? 0),
  );
}

// Single source of truth for "load this device" — used by both the device
// picker (every click) and the Mockup tab's first-entry default, so the two
// paths can never drift (e.g. one resetting the model offset, the other not).
export function selectDevice(key: string): void {
  const dev = DEVICES.find((d) => d.key === key);
  if (!dev) return;
  const s = use3DStore.getState();
  s.setModelUrl(dev.modelUrl, dev.label);
  // Finish is a shared mockup parameter, but the swatch belongs to the
  // selected device. Never carry (for example) iPhone 17 Lavender over to an
  // Air or Pro model that has a different finish palette.
  s.setParam('mockup', 'finish', dev.finishes[0]?.hex ?? '');
  s.setModelScale(1);
  s.centerModel(0, 0);                          // device meshes are already bbox-centred
  s.setParam('mockup', 'useModelColor', 'On');   // show its real materials first
}
