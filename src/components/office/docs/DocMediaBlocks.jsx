/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { OfficeButton } from '../OfficeBar.jsx';

const MAX_TABLE = 20;

/** An editable table: the first row is the header. */
export function DocTableBlock({ block, onChange, readOnly }) {
  const rows = block.rows?.length ? block.rows : [['']];
  const width = Math.max(1, ...rows.map((r) => r.length));
  const set = (r, c, value) => onChange({ rows: rows.map((row, i) => (i !== r ? row : Array.from({ length: width }, (_, j) => (j === c ? value : row[j] || '')))) });
  const addRow = () => rows.length < MAX_TABLE * 3 && onChange({ rows: [...rows, Array(width).fill('')] });
  const addCol = () => width < MAX_TABLE && onChange({ rows: rows.map((row) => [...row, ...Array(width - row.length).fill(''), '']) });
  const dropRow = () => rows.length > 1 && onChange({ rows: rows.slice(0, -1) });
  const dropCol = () => width > 1 && onChange({ rows: rows.map((row) => row.slice(0, width - 1)) });
  return (
    <div className="hb-of-block" data-type="table">
      <table className="hb-of-table">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {Array.from({ length: width }, (_, c) => {
                const Cell = r === 0 ? 'th' : 'td';
                return (
                  <Cell key={c}>
                    <input value={row[c] || ''} readOnly={readOnly} aria-label={`Row ${r + 1} column ${c + 1}`}
                      placeholder={r === 0 ? `Column ${c + 1}` : ''} onChange={(e) => set(r, c, e.target.value)} />
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <div className="hb-of-table-tools">
          <OfficeButton wide label="Row" icon={<Icon.Plus size={10} />} title="Add a row" onClick={addRow} />
          <OfficeButton wide label="Column" icon={<Icon.Plus size={10} />} title="Add a column" onClick={addCol} />
          <OfficeButton wide label="Row" icon={<Icon.Minimize size={10} />} title="Remove the last row" onClick={dropRow} disabled={rows.length < 2} />
          <OfficeButton wide label="Column" icon={<Icon.Minimize size={10} />} title="Remove the last column" onClick={dropCol} disabled={width < 2} />
        </div>
      )}
    </div>
  );
}

export function DocImageBlock({ block, onChange, readOnly }) {
  return (
    <figure className="hb-of-block hb-of-figure" data-type="image">
      {block.src ? <img src={block.src} alt={block.alt || ''} draggable={false} /> : <div className="hb-of-missing">Picture missing</div>}
      <figcaption>
        <input value={block.alt || ''} readOnly={readOnly} placeholder="Caption" aria-label="Picture caption"
          onChange={(e) => onChange({ alt: e.target.value })} />
      </figcaption>
    </figure>
  );
}
