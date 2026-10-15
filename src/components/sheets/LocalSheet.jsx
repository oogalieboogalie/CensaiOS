/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { copyToClipboard } from '../../lib/chat/clipboard.js';
import { hostOf } from '../../lib/research/researchApi.js';
import { addColumn, addRows, cellValue, colLetter, normalizeSheet, pasteGrid, removeColumn, setCell, toTsv } from './sheetModel.js';
import { useResearchFill } from './useResearchFill.js';
import { getCollaborationClientId } from '../../lib/collaboration/clientIdentity.js';

function ResearchColumnForm({ columns, onAdd, onCancel }) {
  const [name, setName] = React.useState('');
  const [prompt, setPrompt] = React.useState('');
  const [from, setFrom] = React.useState(columns[0]?.id || '');
  const submit = (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    onAdd({ name: name.trim() || prompt.trim().slice(0, 28), research: { prompt: prompt.trim(), from } });
  };
  return (
    <form className="hb-sheet-form" onSubmit={submit} aria-label="New research column">
      <div className="hb-lh-label">Research column</div>
      <label>For each row in
        <select className="hb-lh-select" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Look up the value in">
          {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <input className="hb-sheet-field" value={prompt} onChange={(e) => setPrompt(e.target.value)} autoFocus
        placeholder="find the website and HQ city" aria-label="What to find" />
      <input className="hb-sheet-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Column name (optional)" aria-label="Column name" />
      <div className="hb-sheet-form-actions">
        <button type="button" className="hb-lh-pill" data-size="sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="hb-lh-pill" data-size="sm" data-primary="true" disabled={!prompt.trim()}>Add column</button>
      </div>
    </form>
  );
}

// Keys that finish typing in a cell and where they send you, as in Excel:
// Tab right, Shift+Tab left, Enter down, Shift+Enter up.
const MOVE_KEYS = { Tab: [1, 0], Enter: [0, 1] };

function Cell({ row, column, editing, onEdit, onCommit, onPaste }) {
  const cell = row.cells?.[column.id] || {};
  const done = React.useRef(false);
  React.useEffect(() => { if (editing) done.current = false; }, [editing]);
  // Commit once: moving to the next cell unmounts this input and can blur it.
  const finish = (value, move) => { if (done.current) return; done.current = true; onCommit(value, move); };
  if (editing) {
    return (
      <td className="hb-sheet-cell" data-editing="true">
        <input autoFocus defaultValue={cell.v || ''} aria-label={`${column.name} cell`}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[\t\n]/.test(text.trim())) { e.preventDefault(); onPaste(text); }
          }}
          onBlur={(e) => finish(e.target.value)}
          onKeyDown={(e) => {
            const move = MOVE_KEYS[e.key];
            if (move && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const back = e.shiftKey ? -1 : 1;
              finish(e.currentTarget.value, { dc: move[0] * back, dr: move[1] * back });
            } else if (e.key === 'Escape') finish(null);
          }} />
      </td>
    );
  }
  return (
    <td className="hb-sheet-cell" data-status={cell.status || undefined} onClick={onEdit} title={cell.srcTitle || undefined}>
      <span className="hb-sheet-v">{cell.status === 'working' ? 'Searching…' : cell.v || (cell.status === 'not found' ? 'Not found' : '')}</span>
      {cell.src && (
        <a className="hb-sheet-src" href={cell.src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          aria-label={`Source: ${cell.srcTitle || cell.src}`} title={cell.srcTitle || cell.src}>{hostOf(cell.src)}</a>
      )}
    </td>
  );
}

/** The cell `move` steps away, or null at the edge of the sheet (typing stops there). */
function neighbour(sheet, rowId, colId, move) {
  if (!move) return null;
  const r = sheet.rows.findIndex((row) => row.id === rowId) + move.dr;
  const c = sheet.columns.findIndex((col) => col.id === colId) + move.dc;
  if (r < 0 || c < 0 || r >= sheet.rows.length || c >= sheet.columns.length) return null;
  return { rowId: sheet.rows[r].id, colId: sheet.columns[c].id };
}

/** The board's own spreadsheet, with Research columns filled by Tavily. */
export function LocalSheet({ win, onUpdate, readOnly = false }) {
  const sheet = normalizeSheet(win.sheet);
  const sheetRef = React.useRef(sheet);
  sheetRef.current = sheet;
  const commit = React.useCallback((next) => { sheetRef.current = next; onUpdate?.({ sheet: next }); }, [onUpdate]);
  const fill = useResearchFill({ sheetRef, commit });
  const [editing, setEditing] = React.useState(null); // { rowId, colId }
  const [adding, setAdding] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // A sheet made by a recipe (Compare and price) runs its Research columns
  // once, in the browser of the person who asked; teammates watch it fill.
  React.useEffect(() => {
    const queue = sheetRef.current.autoRun;
    if (readOnly || !queue?.length || sheetRef.current.autoRunBy !== getCollaborationClientId()) return;
    commit({ ...sheetRef.current, autoRun: [] });
    (async () => {
      for (const colId of queue) if (!(await fill.run(colId))) break;
    })();
  }, []);

  const commitCell = (rowId, colId, value, move) => {
    setEditing(neighbour(sheet, rowId, colId, move));
    if (value === null || value === cellValue(sheet.rows.find((r) => r.id === rowId), colId)) return;
    commit(setCell(sheet, rowId, colId, { v: value, src: null, srcTitle: null, status: null }));
  };
  const copy = async () => {
    if (await copyToClipboard(toTsv(sheet))) { setCopied(true); setTimeout(() => setCopied(false), 1200); }
  };
  const runningCol = fill.running?.colId;

  return (
    <div className="hb-sheet">
      {!readOnly && (
        <div className="hb-sheet-bar">
          <button type="button" className="hb-lh-pill" data-size="sm" data-primary="true" onClick={() => setAdding(true)} disabled={adding}>
            <Icon.Search size={11} />Research column
          </button>
          <button type="button" className="hb-lh-pill" data-size="sm" onClick={() => commit(addColumn(sheet))}><Icon.Plus size={11} />Column</button>
          <button type="button" className="hb-lh-pill" data-size="sm" onClick={() => commit(addRows(sheet, 5))}><Icon.Plus size={11} />5 rows</button>
          <button type="button" className="hb-lh-pill" data-size="sm" onClick={copy}><Icon.Copy size={11} />{copied ? 'Copied' : 'Copy as table'}</button>
          {fill.running && (
            <span className="hb-sheet-progress" role="status">
              Filling {sheet.columns.find((c) => c.id === runningCol)?.name}: {fill.running.done} of {fill.running.total}
              <button type="button" className="hb-lh-pill" data-size="sm" onClick={fill.stop}><Icon.Stop size={9} />Stop</button>
            </span>
          )}
        </div>
      )}
      {adding && <ResearchColumnForm columns={sheet.columns.filter((c) => !c.research)} onCancel={() => setAdding(false)}
        onAdd={(col) => { setAdding(false); const next = addColumn(sheet, col); commit(next); fill.run(next.columns[next.columns.length - 1].id); }} />}
      {fill.error && <div role="alert" className="hb-lh-alert">{fill.error}</div>}
      <div className="hb-sheet-scroll">
        <table className="hb-sheet-grid">
          <thead>
            <tr>
              <th className="hb-sheet-corner" aria-hidden="true" />
              {sheet.columns.map((c, i) => (
                <th key={c.id} data-research={c.research ? 'true' : undefined} title={c.research ? `Research: ${c.research.prompt}` : undefined}>
                  <div className="hb-sheet-th">
                    <span className="hb-lh-mono">{colLetter(i)}</span>
                    <span className="hb-sheet-name">{c.name}</span>
                    {c.research && !readOnly && (
                      <button type="button" className="hb-icon-btn" disabled={Boolean(fill.running)} onClick={() => fill.run(c.id, { overwrite: true })}
                        aria-label={`Run research for ${c.name}`} title="Run again for every row"><Icon.Refresh size={11} /></button>
                    )}
                    {!readOnly && sheet.columns.length > 1 && (
                      <button type="button" className="hb-icon-btn" disabled={runningCol === c.id} onClick={() => commit(removeColumn(sheet, c.id))}
                        aria-label={`Remove column ${c.name}`} title="Remove column"><Icon.Close size={10} /></button>
                    )}
                  </div>
                  {c.research && <div className="hb-sheet-prompt">{c.research.prompt}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={row.id}>
                <th className="hb-sheet-rownum hb-lh-mono" scope="row">{r + 1}</th>
                {sheet.columns.map((c) => (
                  <Cell key={c.id} row={row} column={c}
                    editing={!readOnly && editing?.rowId === row.id && editing?.colId === c.id}
                    onEdit={() => !readOnly && setEditing({ rowId: row.id, colId: c.id })}
                    onCommit={(value, move) => commitCell(row.id, c.id, value, move)}
                    onPaste={(text) => { setEditing(null); commit(pasteGrid(sheet, row.id, c.id, text)); }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
