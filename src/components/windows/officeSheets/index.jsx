/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { SheetGrid } from '../../office/sheets/SheetGrid.jsx';
import { SheetChart } from '../../office/sheets/SheetChart.jsx';
import { SheetTabs } from '../../office/sheets/SheetTabs.jsx';
import { useSheet } from '../../office/sheets/useSheet.js';
import { useSheetFiles } from '../../office/sheets/useSheetFiles.js';
import { rangeText } from '../../../lib/office/cellRef.js';

const FORMATS = [['general', 'Automatic'], ['number', '1,234.00'], ['currency', '$1,234.00'], ['percent', '12.5%'], ['date', '2026-10-09']];

// Censai Sheets: a spreadsheet on the canvas with formulas across sheets,
// charts, and real .xlsx / .csv in and out. Each cell syncs on its own.
export function OfficeSheetsWindow({ win = {}, onUpdate }) {
  const s = useSheet(win, onUpdate);
  const files = useSheetFiles(win, onUpdate, s);
  const keysRef = React.useRef(null);
  const title = win.title || 'Untitled sheet';
  const st = s.cellAt(s.active)?.s || {};
  const refocus = () => keysRef.current?.focus({ preventScroll: true });

  const onKeyDown = (e) => {
    if (s.edit) return;
    const mod = e.ctrlKey || e.metaKey;
    const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (moves[e.key]) { e.preventDefault(); s.moveBy(...moves[e.key], e.shiftKey); return; }
    if (e.key === 'Tab') {
      // At the first or last column Tab lets go, so the keyboard can reach the toolbar and sheet tabs.
      const atEdge = e.shiftKey ? s.sel.ac === 0 : s.sel.ac === s.sheet.cols - 1;
      if (!atEdge) { e.preventDefault(); s.moveBy(e.shiftKey ? -1 : 1, 0); }
      return;
    }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); s.startEdit(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); s.clearSelection(); return; }
    if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); s.style(e.key.toLowerCase()); return; }
    if (!mod && !e.altKey && e.key.length === 1) { e.preventDefault(); s.startEdit(e.key); }
  };

  return (
    <>
      <WindowTitle icon={<Icon.List size={12} />} label={title} subtitle="Censai Sheets" />
      <div className="hb-of" data-app="sheets">
        <OfficeBar title={title} formats={files.formats} onImport={files.importFile} importHint="Import an Excel (.xlsx) or CSV file">
          <OfficeButton label="B" title="Bold (Ctrl+B)" pressed={Boolean(st.b)} onClick={() => s.style('b')}><strong>B</strong></OfficeButton>
          <OfficeButton label="I" title="Italic (Ctrl+I)" pressed={Boolean(st.i)} onClick={() => s.style('i')}><em>I</em></OfficeButton>
          <OfficeButton label="U" title="Underline (Ctrl+U)" pressed={Boolean(st.u)} onClick={() => s.style('u')}><u>U</u></OfficeButton>
          <OfficeSep />
          {['left', 'center', 'right'].map((a) => (
            <OfficeButton key={a} label={a[0].toUpperCase()} title={`Align ${a}`} pressed={st.align === a} onClick={() => s.style('align', st.align === a ? null : a)}>
              <span className="hb-of-align" data-align={a} aria-hidden="true"><i /><i /><i /></span>
            </OfficeButton>
          ))}
          <OfficeButton label="Fill" title="Highlight cells" pressed={Boolean(st.fill)} onClick={() => s.style('fill')}><span className="hb-of-swatch" aria-hidden="true" /></OfficeButton>
          <select className="hb-of-select" aria-label="Number format" value={st.fmt || 'general'} onChange={(e) => s.style('fmt', e.target.value)}>
            {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <OfficeSep />
          <OfficeButton wide label="Chart" icon={<Icon.Activity size={12} />} title="Chart the selected cells" onClick={() => s.sheets.addChart('bar')} />
          <OfficeButton wide label="Rows" icon={<Icon.Plus size={10} />} title="Add 20 rows" onClick={() => s.sheets.grow(20, 0)} />
        </OfficeBar>
        <div className="hb-of-fx">
          <span className="hb-of-fx-addr" aria-label="Selected cells">{rangeText(s.sel)}</span>
          <span className="hb-of-fx-sign" aria-hidden="true">fx</span>
          <input className="hb-of-fx-input" aria-label="Cell contents" placeholder="Type a value or a formula like =SUM(A1:A9)"
            value={s.edit ? s.edit.value : (s.cellAt(s.active)?.v || '')}
            onFocus={() => { if (!s.edit) s.startEdit(undefined, 'bar'); }}
            onChange={(e) => s.setEdit({ address: s.edit?.address || s.active, from: s.edit?.from || 'bar', value: e.target.value })}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') { e.preventDefault(); s.commitEdit(0, e.shiftKey ? -1 : 1); refocus(); }
              // Tab saves and moves right; Shift+Tab leaves the bar backwards (blur saves).
              if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); s.commitEdit(1, 0); refocus(); }
              if (e.key === 'Escape') { e.preventDefault(); s.setEdit(null); refocus(); }
            }}
            onBlur={() => s.commitEdit(0, 0)} />
        </div>
        <div className="hb-of-sheetbody" ref={keysRef} tabIndex={0} onKeyDown={onKeyDown} data-no-drag
          aria-label={`${s.sheet.name} cells`}
          onCopy={(e) => { if (s.edit) return; e.preventDefault(); e.clipboardData.setData('text/plain', s.copyText()); }}
          onPaste={(e) => { if (s.edit) return; e.preventDefault(); s.pasteText(e.clipboardData.getData('text/plain')); }}>
          <SheetGrid sheet={s} refocus={refocus} />
        </div>
        {(s.sheet.charts || []).length > 0 && (
          <div className="hb-of-charts">
            {s.sheet.charts.map((chart) => (
              <SheetChart key={chart.id} chart={chart} calc={s.calc} sheetId={s.sheet.id}
                onChange={(c) => s.sheets.updateChart(chart.id, c)} onRemove={() => s.sheets.removeChart(chart.id)} />
            ))}
          </div>
        )}
        <SheetTabs book={s.book} activeId={s.sheet.id} onPick={s.setActiveId} sheets={s.sheets} />
      </div>
    </>
  );
}

export default OfficeSheetsWindow;
