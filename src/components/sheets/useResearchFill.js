// Runs a Research column: one Tavily-backed lookup per row, one row at a
// time with a short gap between calls (so a long sheet never bursts the
// person's Tavily quota), each cell written as it lands so teammates watch
// the column fill in. Stop finishes the cell in flight and halts.

import React from 'react';
import { researchApi } from '../../lib/research/researchApi.js';
import { cellValue, rowsToFill, setCell } from './sheetModel.js';

export const FILL_GAP_MS = 900;

const wait = (ms, signal) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});

export function useResearchFill({ sheetRef, commit, gapMs = FILL_GAP_MS }) {
  const [running, setRunning] = React.useState(null); // { colId, done, total }
  const [error, setError] = React.useState('');
  const abortRef = React.useRef(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const stop = React.useCallback(() => abortRef.current?.abort(), []);

  // Resolves true when the column finished, false when stopped or blocked.
  const run = React.useCallback(async (colId, { overwrite = false } = {}) => {
    if (abortRef.current) return false;
    const column = sheetRef.current.columns.find((c) => c.id === colId);
    const rows = rowsToFill(sheetRef.current, column, { overwrite });
    if (!rows.length) {
      setError(`Nothing to fill: put values in “${sheetRef.current.columns.find((c) => c.id === column?.research?.from)?.name || 'the lookup column'}” first.`);
      return false;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setError('');
    setRunning({ colId, done: 0, total: rows.length });
    let blocked = false;
    for (let i = 0; i < rows.length && !controller.signal.aborted && !blocked; i += 1) {
      const rowId = rows[i].id;
      const row = sheetRef.current.rows.find((r) => r.id === rowId);
      if (!row) continue;
      commit(setCell(sheetRef.current, rowId, colId, { status: 'working' }));
      const context = Object.fromEntries(sheetRef.current.columns
        .filter((c) => c.id !== colId && c.id !== column.research.from && cellValue(row, c.id))
        .map((c) => [c.name, cellValue(row, c.id)]));
      try {
        const cell = await researchApi.fill({ value: cellValue(row, column.research.from), prompt: column.research.prompt, row: context, signal: controller.signal });
        commit(setCell(sheetRef.current, rowId, colId, { v: cell.value || '', src: cell.sourceUrl || null, srcTitle: cell.sourceTitle || null, status: cell.status || 'done' }));
      } catch (err) {
        const stopped = err?.name === 'AbortError';
        commit(setCell(sheetRef.current, rowId, colId, { status: stopped ? null : 'failed' }));
        if (!stopped) {
          setError(err.message || 'A lookup failed.');
          if (err.status === 424 || err.status === 401 || err.status === 429) blocked = true;
        }
      }
      setRunning({ colId, done: i + 1, total: rows.length });
      if (i < rows.length - 1) await wait(gapMs, controller.signal);
    }
    abortRef.current = null;
    setRunning(null);
    return !controller.signal.aborted && !blocked;
  }, [sheetRef, commit, gapMs]);

  return { running, error, clearError: () => setError(''), run, stop };
}
