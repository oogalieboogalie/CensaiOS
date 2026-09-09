import React, { useState, useEffect } from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { api } from '../lib/api.js';

export function SheetsWindow({ win, onUpdate }) {
  const [spreadsheetId, setSpreadsheetId] = useState(win.spreadsheetId || '');
  const [range, setRange] = useState(win.range || 'Sheet1!A1:D10');

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [editCell, setEditCell] = useState(null); // { r, c, val }

  const loadData = async (sid = spreadsheetId, rng = range) => {
    if (!sid || !rng) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.readSheets(sid, rng);
      setData(res.values || []);
      onUpdate({ spreadsheetId: sid, range: rng });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (win.spreadsheetId && win.range && data.length === 0 && !error) {
      loadData(win.spreadsheetId, win.range);
    }
  }, []);

  const handleUpdateCell = async (r, c, val) => {

    const [sheetPrefix, cellStr] = range.split('!');
    const match = (cellStr || range).match(/([A-Z]+)([0-9]+)/);

    let baseCol = 0;
    let baseRow = 1;
    if (match) {
      const colStr = match[1];
      for (let i = 0; i < colStr.length; i++) {
        baseCol = baseCol * 26 + (colStr.charCodeAt(i) - 64);
      }
      baseCol -= 1; // 0-indexed
      baseRow = parseInt(match[2], 10);
    }

    const targetColIdx = baseCol + c;
    const targetRow = baseRow + r;

    let targetColStr = '';
    let tempCol = targetColIdx;
    while (tempCol >= 0) {
      targetColStr = String.fromCharCode(65 + (tempCol % 26)) + targetColStr;
      tempCol = Math.floor(tempCol / 26) - 1;
    }

    const cellRange = sheetPrefix && cellStr ? `${sheetPrefix}!${targetColStr}${targetRow}` : `${targetColStr}${targetRow}`;


    setLoading(true);
    setError(null);
    try {
      await api.updateSheets(spreadsheetId, cellRange, val);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setEditCell(null);
    }
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.List size={14} />}
        label={win.title || 'Spreadsheet'}
        subtitle={spreadsheetId ? 'Connected' : 'Setup'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter((a) => a !== id) })}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--ink)', minHeight: 0 }}>

        {/* Header Controls */}
        <div style={{ padding: 12, borderBottom: '1px solid var(--hairline)', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--surface-2)' }}>
          <input
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            placeholder="Spreadsheet ID..."
            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12 }}
          />
          <input
            value={range}
            onChange={(e) => setRange(e.target.value)}
            placeholder="Sheet1!A1:D10"
            style={{ width: 120, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12 }}
          />
          <button
            onClick={() => loadData()}
            disabled={loading || !spreadsheetId || !range}
            style={{ padding: '4px 12px', borderRadius: 4, background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: (loading || !spreadsheetId || !range) ? 0.6 : 1 }}
          >
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {error && <div style={{ color: 'var(--ps-red)', marginBottom: 12, fontSize: 12, padding: 8, background: 'color-mix(in srgb, var(--ps-red) 10%, transparent)', borderRadius: 4 }}>Error: {error}</div>}

          {!spreadsheetId || !range ? (
            <div style={{ color: 'var(--ink-soft)', fontSize: 12, textAlign: 'center', marginTop: 40 }}>
              Enter a Spreadsheet ID and Range to connect.
            </div>
          ) : data.length > 0 ? (
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <tbody>
                {data.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => {
                      const isEditing = editCell?.r === r && editCell?.c === c;
                      return (
                        <td
                          key={c}
                          style={{ border: '1px solid var(--hairline)', padding: 0, height: 24, minWidth: 60, position: 'relative' }}
                          onClick={() => !isEditing && setEditCell({ r, c, val: cell })}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              defaultValue={cell}
                              onBlur={(e) => {
                                if (e.target.value !== cell) {
                                  handleUpdateCell(r, c, e.target.value);
                                } else {
                                  setEditCell(null);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.target.blur();
                                if (e.key === 'Escape') setEditCell(null);
                              }}
                              style={{ width: '100%', height: '100%', border: 'none', padding: '0 4px', background: 'var(--surface-2)', color: 'var(--ink)', boxSizing: 'border-box', outline: '1px solid var(--accent)' }}
                            />
                          ) : (
                            <div style={{ padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {cell}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: 'var(--ink-soft)', fontSize: 12, textAlign: 'center', marginTop: 40 }}>
              {loading ? 'Loading...' : 'No data in range.'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
