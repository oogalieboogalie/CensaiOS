// A student's seat in a live lesson (spec 12): their own board to work on,
// the instructor's board to follow, the lesson's steps with the
// instructor's stamps, a raised hand, and the class stream if there is one.

import React from 'react';
import { api } from '../lib/api.js';
import { useBoardEvent } from '../lib/collaboration/boardEvents.js';
import { Icon } from '../components/Icons.jsx';
import { GuestBoard } from './GuestApp.jsx';
import { chipButton } from './GuestJoin.jsx';
import { webOnlyFrameSrc } from '../lib/frameSrc.js';

const REFRESH_MS = 4000;

function LessonPanel({ state, onTick }) {
  const { progress } = state;
  return (
    <div className="hb-lesson-panel" data-testid="lesson-panel">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 650 }}>{state.title}</span>
        <span className="hb-class-meta" style={{ marginLeft: 'auto' }}>{progress.done} of {progress.total} done</span>
      </div>
      <div className="hb-class-bar"><span style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></div>
      {progress.steps.map((step, index) => (
        <label key={step.id} className="hb-lesson-step" data-testid={`lesson-step-${index + 1}`} data-approved={step.approved ? 'true' : undefined}>
          <input type="checkbox" checked={step.done} onChange={(event) => onTick(step.id, event.target.checked)} />
          <span>{index + 1}. {step.title}</span>
          {step.approved && <span className="hb-lesson-stamp"><Icon.Check size={11} />Looks good{step.approvedBy ? ` · ${step.approvedBy}` : ''}</span>}
          {step.done && !step.approved && <span className="hb-lesson-waiting">Waiting for your instructor</span>}
          {step.note && <span className="hb-lesson-note">{step.note}</span>}
        </label>
      ))}
    </div>
  );
}

function StreamPanel({ url }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="hb-lesson-stream" data-testid="lesson-stream">
      <div className="hb-lesson-stream-head">
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: 'var(--danger)' }} />
        Live stream
        <button type="button" className="hb-btn" onClick={() => setOpen((value) => !value)}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && <iframe src={webOnlyFrameSrc(url) || undefined} title="Class live stream" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />}
    </div>
  );
}

export function ClassSeat({ onEnded }) {
  const [state, setState] = React.useState(null);
  const [view, setView] = React.useState('mine');
  const [panelOpen, setPanelOpen] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setState(await api.getMyClass());
    } catch (error) {
      if (error.status === 410 || error.status === 401) onEnded(error.message);
    }
  }, [onEnded]);
  React.useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);
  useBoardEvent('class.changed', load);

  const tick = async (checkpointId, done) => {
    setState((current) => current && {
      ...current,
      progress: { ...current.progress, steps: current.progress.steps.map((step) => (step.id === checkpointId ? { ...step, done } : step)) },
    });
    await api.tickCheckpoint(checkpointId, done).catch(() => undefined);
    load();
  };
  const toggleHand = async () => {
    const raised = !state.handRaised;
    setState((current) => ({ ...current, handRaised: raised }));
    await api.raiseClassHand(raised).catch(() => undefined);
  };

  if (!state) return null;
  const teacher = view === 'teacher' && state.teacherWorkspaceId;
  const session = teacher
    ? { workspace: { id: state.teacherWorkspaceId }, workspaceName: `${state.title} · Instructor`, projected: true, live: true, role: 'view', boardQuery: state.teacherWorkspaceId }
    : { workspace: { id: state.boardWorkspaceId }, workspaceName: `${state.title} · Your board`, projected: false, live: false, role: 'edit' };
  const extras = (
    <>
      {state.teacherWorkspaceId && (
        <button type="button" data-testid="class-view-toggle" style={chipButton(Boolean(teacher))}
          onClick={() => setView(teacher ? 'mine' : 'teacher')}>{teacher ? 'Back to my board' : 'Watch instructor'}</button>
      )}
      <button type="button" data-testid="class-steps-toggle" aria-pressed={panelOpen} style={chipButton(panelOpen)} onClick={() => setPanelOpen((value) => !value)}>
        Steps {state.progress.done}/{state.progress.total}
      </button>
      <button type="button" data-testid="class-hand" aria-pressed={state.handRaised} style={chipButton(state.handRaised)} onClick={toggleHand}>
        <Icon.Hand size={13} />{state.handRaised ? 'Hand raised' : 'Raise hand'}
      </button>
    </>
  );
  return (
    <>
      <GuestBoard key={teacher ? 'teacher' : 'mine'} session={session} extras={extras} leadCamera={!teacher}
        onEnded={teacher ? () => setView('mine') : onEnded} onLeave={null} />
      {panelOpen && <LessonPanel state={state} onTick={tick} />}
      {state.streamUrl && <StreamPanel url={state.streamUrl} />}
    </>
  );
}
