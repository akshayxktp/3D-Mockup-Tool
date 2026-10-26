'use client';

import { getThreeEffect, threeEffects } from '@/three3d';
import { use3DStore } from '@/store/use3DStore';
import { ControlRow, controlVisible } from './Controls';
import { SectionHead, useSection } from './PanelSection';
import type { ControlGroup } from '@/three3d/asciiControls';

// Right column in 3D mode — renders the active 3D effect's control groups
// (Characters, Intensity, Lights, Tint, Post-Processing, …). Writes live into
// use3DStore; the stage + renderer read the values every frame.
// Values a group can hold are primitives or small objects (an xypad's pair), so
// a structural compare is both correct and cheap at this size.
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// One control group, rendered as a top-level foldable section of its own — no
// wrapper section around the set. Nesting them one level down meant two clicks
// to reach any control and two competing header styles in one column; flat, the
// panel reads as a single list you scan once.
//
// Its own component because the fold state is a hook, and a hook cannot be
// called from inside a .map over the groups.
function E3DGroup({ group, sectionId, params, values, onChange, onReset }: {
  group: ControlGroup;
  sectionId?: string;
  params: Record<string, unknown>;
  // params merged over every group's defaults. A visibleWhen rule may name a
  // control the user has never touched (so it is absent from params) or one in
  // another group, and either would read as undefined against raw params.
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReset: () => void;
}) {
  const [open, toggle] = useSection(sectionId);
  const controls = group.controls.filter((c) => controlVisible(c, values)).map((c) => (
    <ControlRow
      key={c.key}
      def={c}
      value={params[c.key] ?? c.default}
      onChange={(v) => onChange(c.key, v)}
    />
  ));

  // The 3D tab renders this panel without folds, and keeps the compact grouped
  // form it has always had.
  if (!toggle) {
    return (
      <div className="e3d-group">
        <div className="e3d-group-title">{group.title}</div>
        {controls}
      </div>
    );
  }

  // Reset appears only on a group that actually holds an edit, so it reads as
  // "this one has been changed" rather than as another permanent icon per row.
  const edited = group.controls.some((c) => c.key in params && !sameValue(params[c.key], c.default));
  return (
    <>
      <SectionHead
        title={group.title}
        open={open}
        onToggle={toggle}
        onReset={edited ? onReset : undefined}
      />
      {open && <div className="section-body e3d-controls">{controls}</div>}
      <div className="hairline" />
    </>
  );
}

export default function Effect3DControls({ effectId: forcedEffectId, collapsible }: { effectId?: string; collapsible?: boolean } = {}) {
  const storeEffectId = use3DStore((s) => s.effectId);
  const def = getThreeEffect(forcedEffectId ?? storeEffectId) ?? threeEffects[0];   // guard stale ids
  const effectId = def.id;
  const params = use3DStore((s) => s.params[effectId]) ?? {};
  // What visibleWhen rules are evaluated against — see E3DGroup's `values`.
  const mergedValues: Record<string, unknown> = {
    ...Object.fromEntries(def.groups.flatMap((g) => g.controls.map((c) => [c.key, c.default]))),
    ...params,
  };
  const setParam = use3DStore((s) => s.setParam);
  const resetEffectSettings = use3DStore((s) => s.resetEffectSettings);
  const mockupAnimation = use3DStore((s) => s.mockupAnimation || 'static');
  const mockupSpeed = use3DStore((s) => s.mockupSpeed || 1);
  const setMockupSpeed = use3DStore((s) => s.setMockupSpeed);
  const mockupEasing = use3DStore((s) => s.mockupEasing);
  const setMockupEasing = use3DStore((s) => s.setMockupEasing);
  const motionStrength = use3DStore((s) => s.mockupMotionStrength);
  const setMotionStrength = use3DStore((s) => s.setMockupMotionStrength);
  // The two outer headers fold as well, so a first load is nothing but a list
  // of names. Camera Motion inside Scene does NOT get its own fold: it is the
  // only group in there, and a fold inside a fold would mean two clicks to
  // reach one row of pills.
  const [sceneOpen, toggleScene] = useSection(collapsible ? `e3d.${effectId}.scene` : undefined);

  return (
    <>
      <SectionHead
        title="Scene"
        badge={<span className="badge" style={{ textTransform: 'capitalize' }}>{mockupAnimation.replace(/_/g, ' ')}</span>}
        open={sceneOpen}
        onToggle={toggleScene}
      />
      {sceneOpen && <div className="section-body e3d-controls">
        <div className="e3d-group">
          <div className="e3d-group-title">Camera Motion</div>
          <div className="ctl-row">
            <label className="ctl-label">Speed</label>
            <div className="pills">
              {[0.5, 1, 1.5, 2].map((sp) => (
                <button key={sp} className={`pill ${mockupSpeed === sp ? 'active' : ''}`} onClick={() => setMockupSpeed(sp)}>{sp}x</button>
              ))}
            </div>
          </div>
          <div className="ctl-row">
            <label className="ctl-label">Motion</label>
            <div className="pills">
              {[0.5, 0.75, 1, 1.25].map((amount) => (
                <button key={amount} className={`pill ${motionStrength === amount ? 'active' : ''}`} onClick={() => setMotionStrength(amount)}>
                  {Math.round(amount * 100)}%
                </button>
              ))}
            </div>
          </div>
          <div className="ctl-row">
            <label className="ctl-label">Curve</label>
            <div className="pills">
              {([['preset', 'Natural'], ['smooth', 'Smooth'], ['linear', 'Linear']] as const).map(([value, label]) => (
                <button key={value} className={`pill ${mockupEasing === value ? 'active' : ''}`} onClick={() => setMockupEasing(value)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>}

      <div className="hairline" />
      {def.groups.map((g) => (
        <E3DGroup
          key={g.title}
          group={g}
          sectionId={collapsible ? `e3d.${effectId}.${g.title}` : undefined}
          params={params}
          values={mergedValues}
          onChange={(key, v) => setParam(effectId, key, v)}
          onReset={() => g.controls.forEach((c) => setParam(effectId, c.key, c.default))}
        />
      ))}
      <div className="section-body">
        <button className="web-auto-btn" onClick={() => resetEffectSettings(effectId)} style={{ width: '100%' }}>
          Reset all values
        </button>
      </div>
    </>
  );
}
