// Extra dock tools. The slim dock loads this file on its own and hides anything
// listed in claimedTools, so the shapes share one button instead of crowding
// the row. Image, undo and redo never become the tool in hand.
import { useEffect, useRef } from 'react';
import { TOOL_DEFS, isEditingTarget } from '../../toolbarDefs.jsx';
import { keyboardClaimed } from '../../../lib/keyboardClaim.js';
import { windowHoldsKeys } from '../../../lib/pasteOwner.js';
import { placePictures } from './placePicture.js';

export const SHAPE_IDS = ['rect', 'ellipse', 'line', 'arrow'];

// Taken off the main row. Rectangle was already there; it moves into the group.
export const claimedTools = [...SHAPE_IDS, 'highlight'];

// Pen colour and size apply to these the same way they apply to the brush.
export const penOptionTools = ['ellipse', 'line', 'arrow', 'highlight'];

const IMAGE = {
  id: 'dock-image', label: 'Image', key: 'I',
  glyph: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15l4-3.5 3 2.5 3-2.5L20 16" />
      <circle cx="9" cy="9.5" r="1" />
    </>
  ),
};

const UNDO = {
  id: 'dock-undo', label: 'Undo', key: 'Z',
  glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M9 14H4.5V9.5M5 13.5A7 7 0 1 1 8 18" />,
};

const REDO = {
  id: 'dock-redo', label: 'Redo', key: 'Y',
  glyph: <path strokeLinecap="round" strokeLinejoin="round" d="M15 14h4.5V9.5M19 13.5A7 7 0 1 0 16 18" />,
};

function def(id) {
  return TOOL_DEFS.find((tool) => tool.id === id);
}

function stepHistory(action) {
  window.dispatchEvent(new CustomEvent('canvas:history', { detail: { action } }));
}

export function DockAbove({ activeTool, renderToolButton }) {
  if (!SHAPE_IDS.includes(activeTool) || !renderToolButton) return null;
  return (
    <div
      data-testid="dock-shapes"
      className="flex items-center hb-glass"
      style={{
        gap: 4,
        padding: '3px 4px',
        border: '1px solid var(--glass-line)',
        borderRadius: 'var(--radius-float)',
        background: 'var(--glass-bg)',
      }}
    >
      {SHAPE_IDS.map((id) => renderToolButton(def(id)))}
    </div>
  );
}

export function DockButtons({ activeTool, renderToolButton }) {
  const fileRef = useRef(null);
  const shape = def(SHAPE_IDS.includes(activeTool) ? activeTool : 'rect');
  const highlight = def('highlight');

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isEditingTarget(e.target) || windowHoldsKeys(e.target) || keyboardClaimed()) return;
      const key = e.key.toLowerCase();
      if (key === 'z') { e.preventDefault(); stepHistory('undo'); }
      else if (key === 'y') { e.preventDefault(); stepHistory('redo'); }
      else if (key === 'i') { e.preventDefault(); fileRef.current?.click(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!renderToolButton) return null;

  return (
    <>
      <div data-dock-divider style={{ width: 1, height: 16, background: 'var(--hairline)', margin: '0 2px' }} />
      {renderToolButton(shape)}
      {renderToolButton(highlight)}
      {renderToolButton(IMAGE, {}, () => fileRef.current?.click())}
      {renderToolButton(UNDO, {}, () => stepHistory('undo'))}
      {renderToolButton(REDO, {}, () => stepHistory('redo'))}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        data-testid="dock-image-file"
        hidden
        onChange={(e) => {
          const files = e.target.files;
          e.target.value = '';
          placePictures(files);
        }}
      />
    </>
  );
}
