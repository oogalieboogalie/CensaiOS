/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ModelIcon } from '../modelIcons.jsx';
import { useSharedCaret } from '../../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../../collaboration/TeammateCarets.jsx';
import { measureLength, niceNumber } from '../../../lib/yorware/modelMeasure.js';

/**
 * A note's text box. It saves to the board as you type, so two people writing
 * in one note merge letter by letter (see windowFormText.js), and a
 * teammate's letters landing in it keep your cursor where it was. On a board,
 * teammates' cursors in the same note show with their names, and yours goes
 * out to them. Each note is its own words, so a cursor in note 1 never shows
 * in note 2. Only a spot goes out, never words.
 */
function NoteEditor({ m, id, maxLength }) {
  const text = String(m.scene.notes[id]?.text ?? '');
  const ref = React.useRef(null);
  useSharedCaret(ref, text);
  const field = `m3n.${id}/text`;
  const live = Boolean(m.windowId && id);
  useCaretReporter(ref, m.windowId, field, live);
  const carets = useTeammateCarets(m.windowId, field, live);
  return (
    <div className="hb-y3d-notebox">
      <textarea ref={ref} className="hb-cr-input hb-cr-textarea" autoFocus value={text} maxLength={maxLength}
        placeholder="What should people know about this spot?" aria-label="Note text"
        onChange={(e) => { if (e.target.value !== text) m.editNote(id, e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); m.setOpenNote(null); } }} />
      <TeammateCarets boxRef={ref} carets={carets} text={text} />
    </div>
  );
}

export function NotesSection({ m, maxLength }) {
  const { notes, noteOrder, models } = m.scene;
  const [a, b] = m.measure;
  return (
    <>
      {m.tool === 'measure' && (
        <section className="hb-cr-section" aria-label="Measure">
          <header className="hb-cr-section-head"><span>Measure</span></header>
          {a && b
            ? <div className="hb-y3d-big hb-cr-num">{niceNumber(measureLength(a, b))}</div>
            : <p className="hb-cr-hint">{a ? 'Now click the second point.' : 'Click two points on a model.'}</p>}
          <p className="hb-cr-hint">In the file's own units. 3D printing files are usually millimetres.</p>
        </section>
      )}
      <section className="hb-cr-section" aria-label="Notes">
        <header className="hb-cr-section-head"><span>Notes</span><span className="hb-cr-tag">{noteOrder.length}</span></header>
        {!noteOrder.length && <p className="hb-cr-hint">Pick the pin tool (N) and click a spot on a model to leave a note everyone on the board sees.</p>}
        <ol className="hb-y3d-notes">
          {noteOrder.map((id, i) => {
            const n = notes[id];
            const open = m.openNote === id;
            return (
              <li key={id} className="hb-y3d-note" data-open={open ? 'true' : undefined}>
                <div className="hb-cr-row">
                  <span className="hb-y3d-pin-num">{i + 1}</span>
                  <button type="button" className="hb-cr-layer-name" onClick={() => m.setOpenNote(open ? null : id)}>
                    <span className="hb-cr-ellipsis">{n.text || 'Empty note'}</span>
                  </button>
                  <button type="button" className="hb-of-btn" title="Delete note" aria-label={`Delete note ${i + 1}`} onClick={() => m.removeNote(id)}><ModelIcon.Trash /></button>
                </div>
                {open && <NoteEditor m={m} id={id} maxLength={maxLength} />}
                <div className="hb-cr-hint">{[n.by, models[n.model]?.name].filter(Boolean).join(' · ')}</div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
