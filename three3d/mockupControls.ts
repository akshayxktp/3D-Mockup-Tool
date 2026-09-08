import type { ControlGroup } from './asciiControls';

// ── Device Mockup control schema ────────────────────────────────────────────
// Realistic (non-toon) PBR render: keeps the GLB's own materials by default —
// controls here are overrides (tint, opacity, wireframe) plus studio lighting
// and reflection strength. No paint/toon-specific fields (see cartoonControls).
export const mockupGroups: ControlGroup[] = [
  {
    title: 'Camera & Hardware',
    controls: [
      { key: 'fieldOfView', label: 'Field of View', type: 'slider', min: 15, max: 90, step: 1, default: 42, unit: '°' },
      { key: 'lidAngle', label: 'Laptop Lid', type: 'slider', min: 3, max: 115, step: 1, default: 112, unit: '°' },
    ],
  },
  {
    title: 'Material',
    controls: [
      { key: 'useModelColor', label: 'Use Model Materials', type: 'toggle', options: ['On', 'Off'], default: 'On' },
      { key: 'color', label: 'Color', type: 'color', default: '#d8d8dc' },
      { key: 'emissive', label: 'Emissive', type: 'color', default: '#000000' },
      { key: 'emissiveIntensity', label: 'Emissive Intensity', type: 'slider', min: 0, max: 5, step: 0.1, default: 1 },
      { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 100, step: 1, default: 100 },
      { key: 'wireframe', label: 'Wireframe', type: 'toggle', options: ['On', 'Off'], default: 'Off' },
      { key: 'flatShading', label: 'Flat Shading', type: 'toggle', options: ['On', 'Off'], default: 'Off' },
    ],
  },
  {
    // Mirrors the reference tool's own Screen section.
    title: 'Screen',
    controls: [
      { key: 'screenBrightness', label: 'Brightness', type: 'slider', min: 0, max: 1.6, step: 0.05, default: 1 },
      // How much of the studio environment the cover glass mirrors back.
      // This shipped at 0 because the old RoomEnvironment map was a lit box on
      // every side, so a mirror-smooth display returned one of its rectangular
      // panels as a hard softbox. three3d/studioEnv.ts replaced that with a
      // dark surround and a few placed cards, so the reflection a screen picks
      // up now is a soft graded falloff rather than a pasted rectangle, and
      // this slider is usable across its whole range.
      //
      // It stays at 0 by default all the same, for a different reason: the
      // point of the stage is to show the artwork someone uploaded, and glare
      // costs legibility. Raise it when the glass matters more than the UI.
      { key: 'screenGlare', label: 'Glare', type: 'slider', min: 0, max: 100, step: 1, default: 0 },
    ],
  },
  {
    title: 'Lights',
    controls: [
      // A named look, applied as multipliers and colour shifts over the four
      // sliders below rather than as replacement values — so the sliders keep
      // working after a preset is chosen, and Default is a true no-op that
      // returns the rig to exactly what it ships with.
      { key: 'lightPreset', label: 'Lighting', type: 'select', options: ['Default', 'Studio Soft', 'Dark Rim', 'Two Tone', 'Warm Glow'], default: 'Default' },
      // The reference tool steers its key light from a 2D "light direction"
      // pad rather than a position; these are that pad's two axes, and its
      // measured defaults (-26°, 0°). Applied as an offset on top of whatever
      // the active animation preset is doing with the key light.
      { key: 'lightAzimuth', label: 'Light Direction X', type: 'slider', min: -180, max: 180, step: 1, default: -26 },
      { key: 'lightElevation', label: 'Light Direction Y', type: 'slider', min: -90, max: 90, step: 1, default: 0 },
      // A stronger key against a lower fill/ambient floor is what actually
      // reads as "sharp" — enough contrast that the device's edges and finish
      // stay defined instead of washing into the bright backdrop.
      { key: 'keyLight', label: 'Key Light', type: 'slider', min: 0, max: 6, step: 0.1, default: 3.2 },
      { key: 'fillLight', label: 'Fill Light', type: 'slider', min: 0, max: 4, step: 0.1, default: 1 },
      { key: 'ambient', label: 'Ambient', type: 'slider', min: 0, max: 3, step: 0.1, default: 0.55 },
      { key: 'envIntensity', label: 'Reflections', type: 'slider', min: 0, max: 3, step: 0.05, default: 1.1 },
      // How big the key light reads as a SOURCE. A small source throws a hard,
      // sharp-edged shadow; a large one (a softbox close in) throws a wide
      // penumbra. That penumbra is the cue the eye actually reads as "soft
      // light", and it is what this widens — 15 reproduces the shadow the rig
      // shipped with, so the default look is unchanged.
      { key: 'lightSoftness', label: 'Light Softness', type: 'slider', min: 0, max: 60, step: 1, default: 15 },
      // Range and 0.60 default both read off the reference tool's Exposure.
      // Split in two because a handset's body and its front face want lighting
      // separately: brightening an orange chassis enough to read on a light
      // backdrop also washes the black glass out to grey.
      { key: 'exposure', label: 'Body Exposure', type: 'slider', min: 0.1, max: 2, step: 0.05, default: 0.6 },
      { key: 'glassExposure', label: 'Glass Exposure', type: 'slider', min: 0.1, max: 2, step: 0.05, default: 0.6 },
    ],
  },
  {
    // Radial defocus: the frame stays sharp inside the focus circle and softens
    // outward, the way a fast lens falls off behind its subject. Strength 0 is
    // the whole group's off switch — the render then skips the pass entirely
    // rather than running a zero-radius blur.
    title: 'Blur',
    controls: [
      { key: 'blurStrength', label: 'Blur', type: 'slider', min: 0, max: 100, step: 1, default: 0 },
      { key: 'blurFocus', label: 'Focus Size', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.52 },
      { key: 'blurFalloff', label: 'Falloff', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.53 },
      // Weights each tap by its own brightness, so a highlight spreads into a
      // disc instead of averaging away — the difference between "out of focus"
      // and "bokeh".
      { key: 'blurBokeh', label: 'Bokeh', type: 'toggle', options: ['On', 'Off'], default: 'Off' },
      // Aperture shape. What a real lens leaves behind is not always a clean
      // disc: mechanical vignetting cuts it to a lemon off-axis (Swirl, Cat's
      // Eye), an aspherical element hollows it out (Soap Bubble), a cylindrical
      // front element ovals it (Anamorphic), and a stopped-down iris shows its
      // blades (Hexagonal). Shapes read strongest with Bokeh on, since that is
      // what makes a highlight spread far enough to show its shape at all.
      { key: 'blurShape', label: 'Bokeh Shape', type: 'select', options: ['Round', 'Swirl', 'Soap Bubble', 'Anamorphic', "Cat's Eye", 'Hexagonal'], default: 'Round' },
      // Lateral chromatic aberration — a magnification difference between
      // wavelengths, so it is invisible at frame centre and strongest in the
      // corners. Runs even at Blur 0, because a lens fringes whether or not
      // anything is out of focus.
      { key: 'blurCA', label: 'Aberration', type: 'select', options: ['Off', 'Subtle', 'Lens', 'Purple Fringe', 'Prism', 'Anamorphic'], default: 'Off' },
      // Directional smear applied INSIDE the defocus only, riding the same
      // falloff mask — a moving background behind a subject that stays sharp.
      { key: 'blurMotion', label: 'Motion Blur', type: 'slider', min: 0, max: 100, step: 1, default: 0 },
      { key: 'blurMotionAngle', label: 'Motion Angle', type: 'slider', min: 0, max: 360, step: 1, default: 0, unit: '°' },
      // Arms the stage for a focus pick: the next click on the device drops the
      // focus point there, the way tapping a phone viewfinder racks focus.
      // Stays armed so the point can be nudged repeatedly, and suppresses
      // part-picking while it is on so one click cannot mean two things.
      { key: 'blurFocusPick', label: 'Click to Focus', type: 'toggle', options: ['On', 'Off'], default: 'Off' },
      // Where that click landed, in viewport UV. Centre until something moves it.
      { key: 'blurFocusX', label: 'Focus X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'blurFocusY', label: 'Focus Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
  },
  {
    // Composition guides. Drawn as a DOM overlay in ThreeStage3D rather than
    // into the scene, so they are a framing aid only and can never reach an
    // export — the same contract a camera's viewfinder grid has.
    title: 'Guides',
    controls: [
      { key: 'grid', label: 'Grid', type: 'pills', options: ['Off', '3×3', '6×6'], default: 'Off' },
    ],
  },
  {
    // Post-grade on the rendered device (CSS filters on the canvas, applied in
    // ThreeStage3D) — the backdrop keeps its own colours.
    title: 'Adjustments',
    controls: [
      { key: 'brightness', label: 'Brightness', type: 'slider', min: 0, max: 200, step: 1, default: 100 },
      { key: 'contrast', label: 'Contrast', type: 'slider', min: 0, max: 200, step: 1, default: 100 },
      { key: 'saturation', label: 'Saturation', type: 'slider', min: 0, max: 200, step: 1, default: 100 },
    ],
  },
  {
    title: 'Ground',
    controls: [
      // The reference's default shot has no ground contact shadow at all — the device
      // floats on a plain backdrop.
      { key: 'shadowOpacity', label: 'Shadow', type: 'slider', min: 0, max: 100, step: 1, default: 0 },
    ],
  },
];
