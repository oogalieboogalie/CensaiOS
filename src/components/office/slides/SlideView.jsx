/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ACCENT_BAR, SLIDE_W_PT, THEMES, blockColor, clampBox, textLines } from '../../../lib/office/slideModel.js';

const pct = (n) => `${n}%`;
const hex = (h) => `#${h}`;

function TextBody({ block, theme, scale }) {
  const size = (block.size || 18) * scale;
  return (
    <div className="hb-of-slidetext" style={{ fontSize: size, fontWeight: block.bold ? 700 : 400, textAlign: block.align || 'left', color: hex(blockColor(block, theme)) }}>
      {textLines(block.text).map((line, i) => (
        <p key={i} data-bullet={line.bullet ? 'true' : undefined} style={line.bullet ? { paddingLeft: size * 0.9 } : undefined}>
          {line.bullet && <span className="hb-of-bullet" style={{ left: 0 }}>{'•'}</span>}
          {line.text || ' '}
        </p>
      ))}
    </div>
  );
}

/** Drag to move, or (from the corner) to resize, in percent of the slide. */
function startDrag(e, block, frame, mode, onChange) {
  e.preventDefault();
  e.stopPropagation();
  const rect = frame.getBoundingClientRect();
  const x0 = e.clientX;
  const y0 = e.clientY;
  const move = (ev) => {
    const dx = ((ev.clientX - x0) / rect.width) * 100;
    const dy = ((ev.clientY - y0) / rect.height) * 100;
    const box = mode === 'move' ? { ...block, x: block.x + dx, y: block.y + dy } : { ...block, w: block.w + dx, h: block.h + dy };
    onChange(clampBox(box), false);
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    const moved = Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 2;
    if (moved) move(ev);
    onChange(null, true, moved);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/**
 * One slide drawn at any width. With `edit` it becomes the editing stage:
 * { selectedId, editingId, onSelect, onEdit, onBox, onText, onRemove }.
 */
export function SlideView({ slide, theme, width, edit, label }) {
  const frame = React.useRef(null);
  const [draft, setDraftState] = React.useState(null); // { id, box } while dragging
  const draftRef = React.useRef(null);
  const setDraft = (d) => { draftRef.current = d; setDraftState(d); };
  const t = THEMES[theme] || THEMES.censai;
  const scale = width / SLIDE_W_PT;
  const blocks = slide?.blocks || [];

  const onBoxChange = (id) => (box, done, moved) => {
    if (box) setDraft({ id, box });
    if (!done) return;
    const last = draftRef.current;
    setDraft(null);
    if (moved && last?.id === id) edit.onBox(id, last.box);
  };

  return (
    <div className="hb-of-slide" ref={frame} aria-label={label} role={edit ? 'group' : 'img'}
      style={{ width, height: (width * 9) / 16, background: hex(t.bg) }}
      onPointerDown={edit ? (e) => { if (e.target === frame.current) edit.onSelect(null); } : undefined}>
      <span className="hb-of-slidebar" style={{ left: pct(ACCENT_BAR.x), top: pct(ACCENT_BAR.y), width: pct(ACCENT_BAR.w), height: pct(ACCENT_BAR.h), background: hex(t.accent) }} />
      {blocks.map((block) => {
        const box = draft?.id === block.id ? { ...block, ...draft.box } : block;
        const selected = edit?.selectedId === block.id;
        const editing = edit?.editingId === block.id;
        const empty = block.type === 'text' && !String(block.text || '').trim();
        if (!edit && empty) return null;
        return (
          <div key={block.id} className="hb-of-sblock" data-selected={selected ? 'true' : undefined} data-type={block.type}
            style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}
            onPointerDown={edit && !editing ? (e) => { edit.onSelect(block.id); startDrag(e, block, frame.current, 'move', onBoxChange(block.id)); } : undefined}
            onDoubleClick={edit && block.type === 'text' ? () => edit.onEdit(block.id) : undefined}>
            {block.type === 'image' ? <img src={block.src} alt={block.alt || ''} draggable={false} />
              : editing ? (
                <textarea className="hb-of-slidetext" autoFocus defaultValue={block.text || ''} aria-label="Slide text"
                  style={{ fontSize: (block.size || 18) * scale, fontWeight: block.bold ? 700 : 400, textAlign: block.align || 'left', color: hex(blockColor(block, theme)) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => edit.onText(block.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); e.stopPropagation(); }} />
              ) : empty ? <div className="hb-of-sblock-hint">{block.role === 'title' ? 'Double-click to add a title' : 'Double-click to add text'}</div>
                : <TextBody block={block} theme={theme} scale={scale} />}
            {selected && !editing && (
              <span className="hb-of-handle" onPointerDown={(e) => startDrag(e, block, frame.current, 'size', onBoxChange(block.id))} aria-hidden="true" />
            )}
            {selected && !editing && edit.onRemove && (
              <button type="button" className="hb-of-sblock-del" aria-label={block.type === 'image' ? 'Delete this picture' : 'Delete this text box'}
                title="Delete (Delete key)" onPointerDown={(e) => e.stopPropagation()} onClick={() => edit.onRemove(block.id)}>{'×'}</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
