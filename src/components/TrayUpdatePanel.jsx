/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { changeCount } from '../lib/appUpdate/api.js';
import { STAGE_TEXT, describeWork, panelStage, stillOpen } from '../lib/appUpdate/trayFlow.js';
import { useTrayUpdate } from '../lib/appUpdate/useTrayUpdate.js';

const box = {
  position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1210,
  width: 'min(440px, calc(100vw - 32px))', padding: 14, display: 'grid', gap: 8,
  background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--elevation-2)', fontSize: 'var(--text-sm)', color: 'var(--ink)',
};
const soft = { color: 'var(--ink-soft)' };
const list = { margin: 0, paddingLeft: 18, color: 'var(--ink-soft)', fontSize: 'var(--text-xs)', maxHeight: 140, overflow: 'auto' };
const button = { all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 650, padding: '4px 10px', borderRadius: 'var(--radius-md)' };
const main = { ...button, background: 'var(--accent-soft)', color: 'var(--ink)' };
const plain = { ...button, color: 'var(--ink-soft)' };

function Buttons({ children }) {
  return <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>{children}</div>;
}

function Work({ work, waitFor }) {
  const changes = waitFor ? work.changes.filter((c) => waitFor.numbers.includes(c.number)) : work.changes;
  return (
    <>
      {work.changeLine && <span style={soft}>{work.changeLine}</span>}
      {changes.length > 0 && <ul style={list}>{changes.map((c) => <li key={c.number}>{c.title}</li>)}</ul>}
      {work.agentLine && <span style={soft}>{work.agentLine}</span>}
    </>
  );
}

/**
 * Opened by the desktop tray's "Update censaiOS" item: looks for an update
 * now, says what is still being worked on, and asks "update now or wait for
 * them?". Waiting updates by itself once those changes land. Owner only:
 * the server refuses everyone else.
 */
export function TrayUpdatePanel() {
  const flow = useTrayUpdate();
  const [showNew, setShowNew] = React.useState(false);
  const { open, phase, status, inFlight, error, waitFor } = flow;

  if (!open && waitFor) {
    const left = stillOpen(waitFor, inFlight).length || waitFor.numbers.length;
    return (
      <div role="status" style={{ ...box, width: 'auto', padding: '6px 12px', display: 'flex', gap: 10, alignItems: 'center' }} data-testid="tray-update-waiting">
        <span style={soft}>Updating after {left} {left === 1 ? 'change lands' : 'changes land'}</span>
        <button type="button" style={plain} onClick={flow.stopWaiting}>Stop waiting</button>
      </div>
    );
  }
  if (!open) return null;

  const work = describeWork(inFlight);
  const stage = phase === 'checking' ? 'checking' : panelStage(status, null);
  const ready = status?.ready;
  const changes = ready?.changes || [];
  const count = changeCount(changes);
  const busyWait = status?.pendingRestart?.waiting;
  let title = 'Update censaiOS';
  let body;
  let actions = null;

  if (phase === 'restarting') {
    title = 'Updating censaiOS…';
    body = <span style={soft}>{busyWait ? 'Waiting for the agents to finish their task, then updating. The board comes back by itself.' : 'This takes a few seconds. The board comes back by itself.'}</span>;
  } else if (phase === 'waiting') {
    title = 'Waiting for the crew';
    body = (
      <>
        <span style={soft}>censaiOS updates by itself once these land. You can keep working.</span>
        <Work work={work} waitFor={waitFor} />
      </>
    );
    actions = <Buttons><button type="button" style={plain} onClick={flow.stopWaiting}>Stop waiting</button><button type="button" style={main} onClick={flow.close}>OK</button></Buttons>;
  } else if (error) {
    body = <span role="alert" style={{ color: 'var(--danger)' }}>{error}</span>;
    actions = <Buttons><button type="button" style={main} onClick={flow.close}>OK</button></Buttons>;
  } else if (stage !== 'ready') {
    const waitable = stage === 'up-to-date' && work.changes.length > 0;
    body = (
      <>
        <span style={soft}>{STAGE_TEXT[stage]}{waitable ? ' Want it to update by itself when they land?' : ''}</span>
        {stage !== 'checking' && <Work work={work} />}
      </>
    );
    actions = stage === 'checking' ? null : (
      <Buttons>
        <button type="button" style={waitable ? plain : main} onClick={flow.close}>{waitable ? 'No thanks' : 'OK'}</button>
        {waitable && <button type="button" style={main} onClick={flow.wait}>Wait for them</button>}
      </Buttons>
    );
  } else {
    title = 'Update ready';
    const more = work.changes.length > 0;
    body = (
      <>
        <span style={soft}>
          A newer censaiOS is ready{count ? ` with ${count}` : ''}.
          {more ? ' Update now, or wait for the ones the crew is still finishing?' : ''}
        </span>
        {showNew && changes.length > 0 && <ul style={list}>{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
        <Work work={work} />
      </>
    );
    actions = (
      <Buttons>
        {changes.length > 0 && <button type="button" style={plain} onClick={() => setShowNew((v) => !v)}>{showNew ? 'Hide changes' : "What's new"}</button>}
        {more ? <button type="button" style={plain} onClick={flow.wait}>Wait for them</button> : <button type="button" style={plain} onClick={flow.close}>Later</button>}
        <button type="button" style={main} onClick={() => flow.restart(ready.commit)}>Update now</button>
      </Buttons>
    );
  }

  return (
    <div role="dialog" aria-label="Update censaiOS" style={box} data-testid="tray-update-panel" data-stage={phase === 'shown' ? stage : phase}>
      <strong>{title}</strong>
      {body}
      {actions}
    </div>
  );
}
