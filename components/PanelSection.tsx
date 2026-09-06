'use client';

import type { ReactNode } from 'react';
import { useUIStore } from '@/store/useUIStore';
import { ChevronDownIcon, UndoIcon } from '@/components/EditorIcons';

// A panel section that can fold away.
//
// The Mockup editor puts every group — screen, model, colours, lights, blur,
// canvas, background — in ONE column, which only works if the groups someone
// isn't using can be shut. So the header becomes a button and the body goes
// away entirely (not `display:none`: a collapsed group should cost no layout
// and no scroll height, which is the entire point of collapsing it).
//
// `id` is what makes a section collapsible. Panels shared with the other tabs
// call these helpers without one and get exactly the static header they had
// before — collapsing is a Mockup-panel behaviour, not a change to every
// screen in the app.
//
// Collapsed is the DEFAULT. A first-run panel is then a short list of names —
// somewhere to choose from rather than something to wade through — and what
// someone opens is remembered, so the panel settles into whatever they actually
// use. A section without an id is not foldable and is always open.
export function useSection(id?: string): [boolean, (() => void) | undefined] {
  const open = useUIStore((s) => (id ? s.sectionsOpen[id] ?? false : true));
  const toggleSection = useUIStore((s) => s.toggleSection);
  if (!id) return [true, undefined];
  return [open, () => toggleSection(id, !open)];
}

export function SectionHead({
  title,
  badge,
  open,
  onToggle,
  onReset,
  children,
}: {
  title: ReactNode;
  badge?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  /** Present only when this section differs from its defaults — see hasEdits(). */
  onReset?: () => void;
  /** Trailing controls that belong to the header itself. */
  children?: ReactNode;
}) {
  if (!onToggle) {
    return (
      <div className="section-head">
        <span className="eyebrow">{title}</span>
        {badge}
        {children}
      </div>
    );
  }
  return (
    <div className={`section-head section-head-fold ${open ? 'is-open' : ''}`}>
      {/* The whole strip folds, so the button spans the row and carries the
          chevron at its far end — a header you can only fold by hitting a 13px
          glyph is a header nobody folds. Anything that does something ELSE (the
          reset) sits on top of it rather than inside, so one row can hold two
          actions without nesting a button in a button. */}
      <button
        type="button"
        className="section-fold-btn"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="section-fold-title">{title}</span>
        <ChevronDownIcon size={13} />
      </button>
      <div className="section-head-tail">
        {badge}
        {children}
        {onReset && (
          // Only rendered when the section actually holds an edit, so it reads
          // as "this one has been changed" at a glance rather than as another
          // permanent icon in every row.
          <button
            type="button"
            className="section-reset"
            onClick={onReset}
            title={`Reset ${typeof title === 'string' ? title : 'section'} to defaults`}
            aria-label={`Reset ${typeof title === 'string' ? title : 'section'} to defaults`}
          >
            <UndoIcon size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
