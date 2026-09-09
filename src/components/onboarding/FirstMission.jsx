import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import {
  areWindowsAdjacent,
  clearFirstMission,
  findAddedWindow,
  FIRST_MISSION_DRAG_EVENT,
  hasNewTodo,
  readFirstMission,
  todoIds,
  writeFirstMission,
} from '../../lib/firstMission.js';
import { getMissionCardPosition, getMissionCopy, useMissionTargetRect } from './missionTargeting.js';

export function FirstMission({ focusMode = false }) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const wins = useWorkspaceStore((state) => state.wins);
  const favorites = useWorkspaceStore((state) => state.sidebarFavorites);
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [firstId, setFirstId] = React.useState(null);
  const [secondId, setSecondId] = React.useState(null);
  const [complete, setComplete] = React.useState(false);
  const initialIds = React.useRef(new Set());
  const secondBaseline = React.useRef(new Set());
  const favoriteBaseline = React.useRef(new Set());
  const todoBaseline = React.useRef(new Set());

  const start = React.useCallback(() => {
    const current = useWorkspaceStore.getState();
    clearFirstMission(current.workspaceId);
    initialIds.current = new Set(current.wins.map((win) => win.id));
    secondBaseline.current = new Set();
    favoriteBaseline.current = new Set(current.sidebarFavorites);
    todoBaseline.current = todoIds(current.wins);
    setFirstId(null); setSecondId(null); setComplete(false); setStep(0); setOpen(true);
  }, []);

  React.useEffect(() => {
    if (!workspaceId) return;
    if (readFirstMission(workspaceId)) setOpen(false);
    else start();
  }, [start, workspaceId]);

  React.useEffect(() => {
    if (!open || step !== 0) return;
    const added = findAddedWindow(wins, initialIds.current);
    if (!added) return;
    setFirstId(added.id);
    secondBaseline.current = new Set(wins.map((win) => win.id));
    setStep(1);
  }, [open, step, wins]);

  React.useEffect(() => {
    if (!open || step !== 1 || secondId) return;
    const added = findAddedWindow(wins, secondBaseline.current);
    if (added) setSecondId(added.id);
  }, [open, secondId, step, wins]);

  React.useEffect(() => {
    if (!open || step !== 1) return undefined;
    const onDrag = (event) => {
      if (secondId && event.detail?.winId !== secondId) return;
      if (!secondId && secondBaseline.current.has(event.detail?.winId)) return;
      const current = useWorkspaceStore.getState();
      const first = current.wins.find((win) => win.id === firstId);
      const dragged = current.wins.find((win) => win.id === event.detail?.winId);
      if (!areWindowsAdjacent(first, dragged && { ...dragged, ...event.detail.position })) return;
      favoriteBaseline.current = new Set(current.sidebarFavorites);
      setSecondId(event.detail.winId);
      setStep(2);
    };
    window.addEventListener(FIRST_MISSION_DRAG_EVENT, onDrag);
    return () => window.removeEventListener(FIRST_MISSION_DRAG_EVENT, onDrag);
  }, [firstId, open, secondId, step]);

  React.useEffect(() => {
    if (!open || step !== 2) return;
    const changed = favorites.length !== favoriteBaseline.current.size
      || favorites.some((id) => !favoriteBaseline.current.has(id));
    if (changed && favorites.length >= 2) {
      todoBaseline.current = todoIds(wins);
      setStep(3);
    }
  }, [favorites, open, step, wins]);

  React.useEffect(() => {
    if (!open || step !== 3 || !hasNewTodo(wins, todoBaseline.current)) return;
    writeFirstMission(workspaceId, 'completed');
    setComplete(true);
  }, [open, step, wins, workspaceId]);

  React.useEffect(() => {
    if (!complete) return undefined;
    const timer = setTimeout(() => setOpen(false), 1400);
    return () => clearTimeout(timer);
  }, [complete]);

  const rect = useMissionTargetRect(step, firstId, secondId, open && !complete);
  const copy = getMissionCopy(step, secondId);
  const cardPosition = getMissionCardPosition(complete ? null : rect);
  const skip = () => { writeFirstMission(workspaceId, 'dismissed'); setOpen(false); };

  if (!open || focusMode) return null;

  return <>
    {rect && <div aria-hidden="true" style={{ position: 'fixed', left: rect.left - 7, top: rect.top - 7, width: rect.width + 14, height: rect.height + 14, zIndex: 500, pointerEvents: 'none', border: '2px solid var(--accent)', borderRadius: 12, boxShadow: '0 0 0 5px var(--accent-soft), var(--shadow-pop)' }} />}
    <section aria-live="polite" data-testid="first-mission" data-mission-step={complete ? 'complete' : step} style={{ position: 'fixed', ...cardPosition, zIndex: 510, width: 320, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', padding: 16, borderRadius: 14, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'var(--shadow-pop)' }}>
      {complete ? <>
        <div style={{ color: 'var(--accent)', font: '700 10px var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Mission complete</div>
        <h3 style={{ margin: '7px 0 5px', fontSize: 17 }}>Your canvas is yours now.</h3>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 12.5, lineHeight: 1.5 }}>You opened, arranged, customized, and left yourself a real next action.</p>
        <button type="button" onClick={() => setOpen(false)} style={{ marginTop: 12, border: 0, borderRadius: 8, padding: '8px 13px', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 750, cursor: 'pointer' }}>Done</button>
      </> : <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{[0, 1, 2, 3].map((index) => <span key={index} style={{ width: index === step ? 22 : 7, height: 7, borderRadius: 999, background: index <= step ? 'var(--accent)' : 'var(--surface-3)', transition: 'width 0.2s' }} />)}<span style={{ marginLeft: 'auto', color: 'var(--ink-faint)', font: '700 9px var(--font-mono)', letterSpacing: '0.1em' }}>MISSION 1 · {step + 1}/4</span></div>
        <h3 style={{ margin: '10px 0 5px', fontSize: 16 }}>{copy[0]}</h3>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 12.5, lineHeight: 1.5 }}>{copy[1]}</p>
        <button type="button" onClick={skip} style={{ all: 'unset', marginTop: 11, color: 'var(--ink-faint)', fontSize: 11, cursor: 'pointer' }}>Skip mission</button>
      </>}
    </section>
  </>;
}
