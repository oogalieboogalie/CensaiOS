/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { addr, colName } from '../../../lib/office/cellRef.js';
import { isErr } from '../../../lib/office/formulaValues.js';

const ROW_H = 24;
const HEAD_W = 44;
const DEFAULT_W = 96;
const OVERSCAN = 8;

function useVisibleRows(scrollRef, total) {
  const [view, setView] = React.useState({ top: 0, height: 600 });
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, [scrollRef]);
  const first = Math.max(0, Math.floor(view.top / ROW_H) - OVERSCAN);
  const last = Math.min(total - 1, Math.ceil((view.top + view.height) / ROW_H) + OVERSCAN);
  return { first, last };
}

function ColumnHead({ index, width, selected, onResize, onSelect }) {
  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const move = (ev) => onResize(width + ev.clientX - x0, false);
    const up = (ev) => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onResize(width + ev.clientX - x0, true); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <th className="hb-of-colhead" data-selected={selected ? 'true' : undefined} style={{ width, minWidth: width, maxWidth: width }}
      onMouseDown={onSelect} scope="col">
      {colName(index)}
      <span className="hb-of-colsize" onPointerDown={startResize} aria-hidden="true" />
    </th>
  );
}

/** The cell grid: virtualised rows, selection, inline editor. */
export function SheetGrid({ sheet: s, refocus }) {
  const { sheet, sel, edit } = s;
  const scrollRef = React.useRef(null);
  const { first, last } = useVisibleRows(scrollRef, sheet.rows);
  const [drafts, setDrafts] = React.useState({});
  const dragging = React.useRef(false);
  const widthOf = (c) => drafts[colName(c)] ?? sheet.widths?.[colName(c)] ?? DEFAULT_W;
  const cols = Array.from({ length: sheet.cols }, (_, c) => c);

  React.useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);
  // Keep the active cell in view when moving with the keyboard.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = sel.ar * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H * 2 > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H * 2 - el.clientHeight;
  }, [sel.ar]);

  const inSel = (c, r) => c >= sel.c1 && c <= sel.c2 && r >= sel.r1 && r <= sel.r2;
  const rows = [];
  for (let r = first; r <= last; r += 1) rows.push(r);

  return (
    <div className="hb-of-gridscroll" ref={scrollRef}>
      <table className="hb-of-grid" style={{ width: HEAD_W + cols.reduce((n, c) => n + widthOf(c), 0) }}>
        <thead>
          <tr>
            <th className="hb-of-corner" style={{ width: HEAD_W, minWidth: HEAD_W }} aria-label="Select all"
              onMouseDown={() => { s.select(0, 0); s.select(sheet.cols - 1, sheet.rows - 1, true); }} />
            {cols.map((c) => (
              <ColumnHead key={c} index={c} width={widthOf(c)} selected={c >= sel.c1 && c <= sel.c2}
                onSelect={() => { s.select(c, 0); s.select(c, sheet.rows - 1, true); }}
                onResize={(px, done) => {
                  if (done) { setDrafts({}); s.sheets.width(colName(c), px); } else setDrafts({ [colName(c)]: Math.max(40, px) });
                }} />
            ))}
          </tr>
        </thead>
        <tbody>
          {first > 0 && <tr style={{ height: first * ROW_H }} aria-hidden="true"><td colSpan={sheet.cols + 1} /></tr>}
          {rows.map((r) => (
            <tr key={r} style={{ height: ROW_H }}>
              <th className="hb-of-rowhead" scope="row" data-selected={r >= sel.r1 && r <= sel.r2 ? 'true' : undefined}
                onMouseDown={() => { s.select(0, r); s.select(sheet.cols - 1, r, true); }}>{r + 1}</th>
              {cols.map((c) => {
                const address = addr(c, r);
                const cell = s.cellAt(address);
                const st = cell?.s || {};
                const editing = edit?.address === address && edit.from !== 'bar';
                const barEdit = edit?.address === address && edit.from === 'bar';
                const value = editing ? null : s.valueAt(address);
                const align = st.align || (typeof value === 'number' ? 'right' : isErr(value) ? 'center' : undefined);
                return (
                  <td key={c} className="hb-of-cell" data-active={sel.ac === c && sel.ar === r ? 'true' : undefined}
                    data-in-sel={inSel(c, r) ? 'true' : undefined} data-error={isErr(value) ? 'true' : undefined}
                    data-fill={st.fill ? 'true' : undefined} data-addr={address}
                    style={{ textAlign: align, fontWeight: st.b ? 600 : undefined, fontStyle: st.i ? 'italic' : undefined, textDecoration: st.u ? 'underline' : undefined }}
                    onMouseDown={(e) => { if (editing) return; dragging.current = true; s.select(c, r, e.shiftKey); }}
                    onMouseEnter={() => { if (dragging.current) s.select(c, r, true); }}
                    onDoubleClick={() => s.startEdit()}>
                    {editing ? (
                      <input className="hb-of-cellinput" autoFocus value={edit.value} aria-label={`Edit ${address}`}
                        onChange={(e) => s.setEdit({ ...edit, value: e.target.value })}
                        onBlur={() => s.commitEdit(0, 0)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); s.commitEdit(0, e.shiftKey ? -1 : 1); refocus(); }
                          else if (e.key === 'Tab') { e.preventDefault(); s.commitEdit(e.shiftKey ? -1 : 1, 0); refocus(); }
                          else if (e.key === 'Escape') { e.preventDefault(); s.setEdit(null); refocus(); }
                          e.stopPropagation();
                        }} />
                    ) : barEdit ? edit.value : s.display(address)}
                  </td>
                );
              })}
            </tr>
          ))}
          {last < sheet.rows - 1 && <tr style={{ height: (sheet.rows - 1 - last) * ROW_H }} aria-hidden="true"><td colSpan={sheet.cols + 1} /></tr>}
        </tbody>
      </table>
    </div>
  );
}
