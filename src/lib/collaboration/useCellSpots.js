import React from 'react';
import { caretChannel, onCaretChannel } from './textCarets.js';
import { clearCellSpot, readCellSpots, reportCellSpot } from './cellSpots.js';

// React side of live cursors in a board Spreadsheet (cellSpots.js).

function useAwareness() {
  const [awareness, setAwareness] = React.useState(() => caretChannel().awareness);
  React.useEffect(() => {
    setAwareness(caretChannel().awareness);
    return onCaretChannel((ch) => setAwareness(ch.awareness));
  }, []);
  return awareness;
}

const flat = (spots) => JSON.stringify([...spots.entries()]);

/** Teammates typing in this sheet, by cell (see readCellSpots), kept current as they move. */
export function useTeammateCells(windowId, enabled = true) {
  const awareness = useAwareness();
  const [spots, setSpots] = React.useState(() => new Map());
  React.useEffect(() => {
    if (!enabled || !awareness || !windowId) {
      setSpots((s) => (s.size ? new Map() : s));
      return undefined;
    }
    const refresh = () => {
      const next = readCellSpots(awareness.getStates(), awareness.clientID, windowId);
      setSpots((s) => (flat(s) === flat(next) ? s : next));
    };
    refresh();
    awareness.on('change', refresh);
    return () => awareness.off('change', refresh);
  }, [awareness, windowId, enabled]);
  return spots;
}

/** Tell teammates which cell this tab is typing in (`editing`: { rowId, colId } or null). */
export function useCellSpotReporter(windowId, editing, enabled = true) {
  const awareness = useAwareness();
  const rowId = editing?.rowId ?? null;
  const colId = editing?.colId ?? null;
  React.useEffect(() => {
    if (!enabled || !awareness || !windowId) return undefined;
    if (rowId === null || colId === null) { clearCellSpot(windowId); return undefined; }
    reportCellSpot(windowId, rowId, colId);
    return undefined;
  }, [awareness, windowId, rowId, colId, enabled]);
  // Closing the sheet takes this tab out of its cells.
  React.useEffect(() => () => clearCellSpot(windowId), [windowId, awareness]);
}
