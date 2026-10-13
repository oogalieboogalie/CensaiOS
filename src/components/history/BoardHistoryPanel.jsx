import React from 'react';
import { getBoardAt, getBoardHistory, restoreBoardTo } from '../../lib/api/boardHistory.js';
import { useBoardEvent } from '../../lib/collaboration/boardEvents.js';
import { describeHistoryEntry, historyTimeLabel } from '../../lib/collaboration/historyText.js';
import { useHistoryPanelStore } from '../../lib/collaboration/historyPanelStore.js';

const REFRESH_MS = 10_000;

const buttonStyle = (primary = false) => ({
  border: primary ? 0 : '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
  padding: '6px 10px', background: primary ? 'var(--accent)' : 'var(--surface-2)',
  color: primary ? 'var(--on-fill)' : 'var(--ink-soft)', font: 'inherit',
  fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
});

/** Small map of the board at a point: every window as an outline, to scale. */
function BoardMap({ board, currentIds }) {
  const wins = (board?.wins || []).filter((w) => [w.x, w.y, w.w, w.h].every(Number.isFinite));
  if (!wins.length) {
    return <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>The board was empty at this point.</div>;
  }
  const minX = Math.min(...wins.map((w) => w.x));
  const minY = Math.min(...wins.map((w) => w.y));
  const maxX = Math.max(...wins.map((w) => w.x + w.w));
  const maxY = Math.max(...wins.map((w) => w.y + w.h));
  const pad = 40;
  const box = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  // Titles stay readable at the panel's size whatever the board's extent.
  const label = Math.max(14, (maxX - minX + pad * 2) / 16);
  return (
    <svg data-testid="history-map" viewBox={box} role="img" aria-label={`Board with ${wins.length} windows`}
      style={{ width: '100%', height: 150, background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
      {wins.map((win) => {
        const gone = !currentIds.has(String(win.id));
        return (
          <g key={win.id}>
            <rect x={win.x} y={win.y} width={win.w} height={win.h} rx={12}
              fill={gone ? 'var(--accent-soft)' : 'var(--surface)'}
              stroke={gone ? 'var(--accent-line)' : 'var(--hairline-strong, var(--hairline))'}
              strokeWidth={Math.max(4, (maxX - minX) / 200)} />
            <text x={win.x + label * 0.8} y={win.y + label * 1.6} fontSize={label} fill="var(--ink-soft)"
              style={{ fontFamily: 'inherit' }}>
              {String(win.title || win.kind || '').slice(0, Math.max(4, Math.floor(win.w / (label * 0.62))))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Entry({ entry, selected, latest, onSelect }) {
  return (
    <button type="button" data-testid="history-entry" aria-pressed={selected} onClick={() => onSelect(entry)}
      style={{
        display: 'grid', gap: 2, width: '100%', textAlign: 'left', padding: '8px 10px',
        border: `1px solid ${selected ? 'var(--accent-line)' : 'var(--hairline)'}`, borderRadius: 'var(--radius-md)',
        background: selected ? 'var(--accent-soft)' : 'var(--surface)', color: 'var(--ink)', font: 'inherit', cursor: 'pointer',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
        <span style={{ fontWeight: 650, color: 'var(--ink)' }}>{entry.who?.name || 'Someone'}</span>
        {entry.who?.kind === 'guest' && <span style={{ color: 'var(--ink-faint)' }}>guest</span>}
        {latest && <span style={{ color: 'var(--accent-ink)', fontWeight: 650 }}>now</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>{historyTimeLabel(entry.at)}</span>
      </span>
      <span style={{ fontSize: 'var(--text-sm)', lineHeight: 1.35 }}>{describeHistoryEntry(entry)}</span>
    </button>
  );
}

/**
 * Board history: every change to the shared board, newest first, with who
 * made it. Pick a point to see the board as it was; "Roll back to here"
 * returns the live board to that point for everyone, as a new change, so
 * nothing after it is lost (the roll-back itself can be undone the same way).
 */
export function BoardHistoryPanel({ workspaceId, wins, canEdit = true }) {
  const open = useHistoryPanelStore((state) => state.open);
  const setOpen = useHistoryPanelStore((state) => state.setOpen);
  const [history, setHistory] = React.useState(null);
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState(null);
  const [board, setBoard] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  const refresh = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      setHistory(await getBoardHistory(workspaceId));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    if (!open) return undefined;
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, refresh]);
  useBoardEvent('board.history.restored', () => { if (open) refresh(); });

  React.useEffect(() => {
    setBoard(null);
    setConfirming(false);
    if (!selected || !workspaceId) return undefined;
    let cancelled = false;
    getBoardAt(workspaceId, selected.seq)
      .then((result) => { if (!cancelled) setBoard(result.board); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [selected, workspaceId]);

  if (!open) return null;

  const entries = history?.entries || [];
  const latestSeq = history?.latestSeq;
  const currentIds = new Set((wins || []).map((w) => String(w.id)));
  const thenCount = board?.wins?.length ?? 0;
  const goneNow = (board?.wins || []).filter((w) => !currentIds.has(String(w.id))).length;
  const newSince = (wins || []).filter((w) => !(board?.wins || []).some((b) => String(b.id) === String(w.id))).length;

  const rollBack = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await restoreBoardTo(workspaceId, selected.seq);
      setNotice(`Board rolled back to ${historyTimeLabel(selected.at)}. This is now the newest entry, so you can undo it the same way.`);
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <aside
      data-testid="history-panel"
      aria-label="Board history"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: 'fixed', top: 16, right: 16, bottom: 16, width: 340, zIndex: 400,
        display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
        background: 'var(--surface)', border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--elevation-3)',
        color: 'var(--ink)', fontSize: 'var(--text-sm)', overflow: 'hidden',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 650, fontSize: 'var(--text-md)' }}>Board history</div>
        <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>{entries.length ? `${entries.length} changes` : ''}</span>
        <button type="button" aria-label="Close board history" onClick={() => setOpen(false)} style={{ ...buttonStyle(), marginLeft: 'auto', padding: '4px 8px' }}>Close</button>
      </header>

      {notice && (
        <div data-testid="history-notice" style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 'var(--text-xs)' }}>
          {notice}
        </div>
      )}
      {error && <div role="alert" style={{ color: 'var(--danger, var(--ink))', fontSize: 'var(--text-xs)' }}>{error}</div>}

      {selected && (
        <section data-testid="history-preview" style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
            The board right after {selected.who?.name || 'someone'} {describeHistoryEntry(selected)}, {historyTimeLabel(selected.at)}
          </div>
          {board ? <BoardMap board={board} currentIds={currentIds} /> : <div style={{ height: 150, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />}
          {board && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
              {thenCount} {thenCount === 1 ? 'window' : 'windows'} then.
              {goneNow > 0 && ` ${goneNow} of them closed since (shaded).`}
              {newSince > 0 && ` ${newSince} opened since would close.`}
            </div>
          )}
          {canEdit && selected.seq !== latestSeq && (confirming ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-xs)' }}>Everyone on the board sees this.</span>
              <button type="button" data-testid="history-confirm" disabled={busy} onClick={rollBack} style={buttonStyle(true)}>{busy ? 'Rolling back…' : 'Yes, roll back'}</button>
              <button type="button" onClick={() => setConfirming(false)} style={buttonStyle()}>Cancel</button>
            </div>
          ) : (
            <button type="button" data-testid="history-restore" disabled={!board} onClick={() => setConfirming(true)} style={{ ...buttonStyle(true), justifySelf: 'start' }}>Roll back to here</button>
          ))}
        </section>
      )}

      <div style={{ display: 'grid', gap: 6, overflowY: 'auto', minHeight: 0, alignContent: 'start' }}>
        {history && !entries.length && (
          <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>No changes yet. Every change to this board shows up here.</div>
        )}
        {entries.map((entry) => (
          <Entry key={entry.seq} entry={entry} latest={entry.seq === latestSeq} selected={selected?.seq === entry.seq}
            onSelect={(next) => { setNotice(''); setSelected(selected?.seq === next.seq ? null : next); }} />
        ))}
        {entries.length > 0 && (
          <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)', padding: '4px 2px' }}>
            The last 7 days are kept step by step; older changes are folded together.
          </div>
        )}
      </div>
    </aside>
  );
}
