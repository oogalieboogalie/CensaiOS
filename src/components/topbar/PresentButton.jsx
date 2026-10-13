import React from 'react';
import { usePresentStore } from '../../lib/presentStore.js';

// Top bar: "Present" starts the run from scene one; the small list button
// next to it opens the scene editor (which key shows what, presenter notes).
export function PresentButton() {
  const start = usePresentStore((s) => s.start);
  const editorOpen = usePresentStore((s) => s.editorOpen);
  const setEditorOpen = usePresentStore((s) => s.setEditorOpen);
  return (
    <div className="hb-present-split" data-testid="present-button">
      <button type="button" className="hb-present-top" onClick={() => start()} title="Present: F1 to F9 jump to a scene, arrows move, Esc ends">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="8" rx="1" /><path d="M8 11v2.5M5.5 13.5h5" />
        </svg>
        Present
      </button>
      <button
        type="button" className="hb-present-top hb-present-top-menu" aria-pressed={editorOpen}
        onClick={() => setEditorOpen(!editorOpen)} title="Edit scenes"
        data-testid="present-scenes-button"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M3 4h10M3 8h10M3 12h6" />
        </svg>
      </button>
    </div>
  );
}
