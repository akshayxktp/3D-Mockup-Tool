'use client';

import { useRef, useState } from 'react';
import { use3DStore, defaultModelFor } from '@/store/use3DStore';
import { findDevice, SLOT_LABELS } from '@/three3d/devices';
import { ControlRow } from './Controls';
import type { ControlDef } from '@/lib/types';
import { SectionHead, useSection } from './PanelSection';

const zoomDef: ControlDef = { key: 'zoom', label: 'Zoom', type: 'slider', min: 0.2, max: 3, step: 0.01, default: 1 };
const posXDef: ControlDef = { key: 'px', label: 'Position X', type: 'slider', min: 0, max: 100, step: 1, default: 50 };
const posYDef: ControlDef = { key: 'py', label: 'Position Y', type: 'slider', min: 0, max: 100, step: 1, default: 50 };
const timeDef: ControlDef = { key: 'statusTime', label: 'Time', type: 'text', default: '9:41' };
const batteryDef: ControlDef = { key: 'statusBattery', label: 'Battery', type: 'slider', min: 0, max: 100, step: 1, default: 100, unit: '%' };
const signalDef: ControlDef = { key: 'statusSignal', label: 'Signal', type: 'slider', min: 0, max: 4, step: 1, default: 4 };

const FITS: { id: 'cover' | 'width' | 'contain'; label: string }[] = [
  { id: 'cover', label: 'Cover' },
  { id: 'width', label: 'Fit width' },
  { id: 'contain', label: 'Contain' },
];

// Right column, Mockup mode only — the artwork shown on the active device's
// "Screen" mesh (fit/zoom/anchor + real corner radius, composited in
// three3d/mockup.ts). Only shown for a recognised bundled device: a custom
// uploaded .glb has no known "Screen" mesh to composite onto.
//
// Assets are held per SCREEN SLOT rather than per device, so a phone shot
// serves every phone and swapping device keeps the artwork. The panel states
// the panel's real native pixel size so a screenshot can be prepared to fit.
export default function ScreenContent({ sectionId }: { sectionId?: string } = {}) {
  const [open, toggle] = useSection(sectionId);
  const modelUrl = use3DStore((s) => (s.models[s.effectId] ?? defaultModelFor(s.effectId)).url);
  const screenMediaBySlot = use3DStore((s) => s.screenMedia);
  const setScreenMedia = use3DStore((s) => s.setScreenMedia);
  const screenFit = use3DStore((s) => s.screenFit);
  const setScreenFit = use3DStore((s) => s.setScreenFit);
  const screenZoom = use3DStore((s) => s.screenZoom);
  const setScreenZoom = use3DStore((s) => s.setScreenZoom);
  const screenOffsetX = use3DStore((s) => s.screenOffsetX);
  const screenOffsetY = use3DStore((s) => s.screenOffsetY);
  const setScreenOffset = use3DStore((s) => s.setScreenOffset);
  const statusBarMode = use3DStore((s) => s.statusBarMode);
  const setStatusBarMode = use3DStore((s) => s.setStatusBarMode);
  const statusBarTime = use3DStore((s) => s.statusBarTime);
  const setStatusBarTime = use3DStore((s) => s.setStatusBarTime);
  const statusBarBattery = use3DStore((s) => s.statusBarBattery);
  const setStatusBarBattery = use3DStore((s) => s.setStatusBarBattery);
  const statusBarSignal = use3DStore((s) => s.statusBarSignal);
  const setStatusBarSignal = use3DStore((s) => s.setStatusBarSignal);
  const fileRef = useRef<HTMLInputElement>(null);

  const device = findDevice(modelUrl);
  // Hook order has to stay stable, so this sits above the early return.
  const [pickedSlot, setPickedSlot] = useState<string | null>(null);
  if (!device) return null;

  // A device can carry more than one panel (the foldable Duo: inner display +
  // outer cover). The primary is always first — it is the one that accepts
  // video and the status-bar overlay.
  const panels = [
    { slot: device.slot, screenPx: device.screenPx, primary: true },
    ...(device.extraScreens ?? []).map((e) => ({ slot: e.slot, screenPx: e.screenPx, primary: false })),
  ];
  const active = panels.find((p) => p.slot === pickedSlot) ?? panels[0];
  const slot = active.slot;
  const media = screenMediaBySlot[slot] ?? null;
  const [pxW, pxH] = active.screenPx;

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    // The blob is what survives: a blob: url is dead on the next load, so the
    // bytes go to IndexedDB and the url is rebuilt from them when the project
    // reopens. Without passing it here the slot persists an id with nothing
    // behind it and the screen comes back empty.
    setScreenMedia(slot, { url, kind: f.type.startsWith('video/') ? 'video' : 'image', blob: f });
  };

  return (
    <>
      <SectionHead
        title="Screen Content"
        badge={<span className="badge">{pxW} × {pxH}</span>}
        open={open}
        onToggle={toggle}
      />
      {open && <div className="section-body mc-body">
        {panels.length > 1 && (
          <div className="ctl-row">
            <label className="ctl-label">Screen</label>
            <div className="pills">
              {panels.map((p) => (
                <button
                  key={p.slot}
                  className={`pill ${slot === p.slot ? 'active' : ''}`}
                  onClick={() => setPickedSlot(p.slot)}
                >
                  {SLOT_LABELS[p.slot]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="ctl-hint">
          {SLOT_LABELS[slot]}
          {panels.length > 1
            ? active.primary
              ? ' — image or video. Open the fold to see it.'
              : ' — still image only. Close the fold to see it.'
            : ` — shared by every ${slot} device.`}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={active.primary ? 'image/*,video/*' : 'image/*'}
          style={{ display: 'none' }}
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        {media ? (
          <div className="sc-asset">
            {media.kind === 'video'
              ? <video className="sc-asset-thumb" src={media.url} muted playsInline />
              : <img className="sc-asset-thumb" src={media.url} alt="" />}
            <span className="sc-asset-name">{SLOT_LABELS[slot]}</span>
            <button className="sc-asset-x" title="Remove" onClick={() => setScreenMedia(slot, null)}>✕</button>
          </div>
        ) : (
          <button className="btn full" onClick={() => fileRef.current?.click()}>Upload image or video…</button>
        )}

        {media && !active.primary && (
          <button className="btn full" onClick={() => fileRef.current?.click()}>Replace image…</button>
        )}

        {media && active.primary && (
          <>
            <button className="btn full" onClick={() => fileRef.current?.click()}>Replace {media.kind}…</button>
            <div className="ctl-row">
              <label className="ctl-label">Fit</label>
              <div className="pills">
                {FITS.map((f) => (
                  <button
                    key={f.id}
                    className={`pill ${screenFit === f.id ? 'active' : ''}`}
                    onClick={() => setScreenFit(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <ControlRow def={zoomDef} value={screenZoom} onChange={(v) => setScreenZoom(Number(v))} />
            <ControlRow def={posXDef} value={screenOffsetX} onChange={(v) => setScreenOffset(Number(v), screenOffsetY)} />
            <ControlRow def={posYDef} value={screenOffsetY} onChange={(v) => setScreenOffset(screenOffsetX, Number(v))} />
          </>
        )}

        {slot === 'phone' && (
          <div className="e3d-group" style={{ marginTop: 12 }}>
            <div className="e3d-group-title">iPhone Status Bar</div>
            <div className="ctl-hint">Show system information above the phone screen content.</div>
            <div className="ctl-row">
              <label className="ctl-label">Status Bar</label>
              <div className="pills">
                {(['off', 'light', 'dark'] as const).map((mode) => (
                  <button key={mode} className={`pill ${statusBarMode === mode ? 'active' : ''}`} onClick={() => setStatusBarMode(mode)}>
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {statusBarMode !== 'off' && (
              <>
                <ControlRow def={timeDef} value={statusBarTime} onChange={(v) => setStatusBarTime(String(v))} />
                <ControlRow def={batteryDef} value={statusBarBattery} onChange={(v) => setStatusBarBattery(Number(v))} />
                <ControlRow def={signalDef} value={statusBarSignal} onChange={(v) => setStatusBarSignal(Number(v))} />
              </>
            )}
          </div>
        )}
      </div>}
    </>
  );
}
