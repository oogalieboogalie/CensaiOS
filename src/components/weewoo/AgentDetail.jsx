/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Avatar, EnergyBar, StatusPill } from './Avatar.jsx';
import { AvatarBuilder } from './AvatarBuilder.jsx';

const KIND_LABEL = { chat: 'Chat agent', agent: 'Agent', agentConsole: 'Coding agent', module: 'Module', research: 'Research', leadHound: 'Lead finder' };
const TABS = [['activity', 'Activity'], ['avatar', 'Avatar'], ['job', 'Job']];

function when(at) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function HelpForm({ agent, office, onAsk }) {
  const helpers = office.agents.filter((a) => a.windowId !== agent.windowId);
  const [to, setTo] = React.useState('');
  const [task, setTask] = React.useState('');
  const [state, setState] = React.useState({ sending: false, error: '' });
  if (!helpers.length) return <div className="ww-faint">No other agent on the board to ask yet.</div>;
  const submit = async (e) => {
    e.preventDefault();
    const target = helpers.find((h) => h.windowId === (to || helpers[0].windowId));
    if (!target || !task.trim()) return;
    setState({ sending: true, error: '' });
    try { await onAsk({ target, task, fromWindowId: agent.windowId }); setTask(''); setState({ sending: false, error: '' }); }
    catch (err) { setState({ sending: false, error: err?.message || 'The request could not be sent.' }); }
  };
  return (
    <form className="ww-help-form" onSubmit={submit} data-testid="ww-help-form">
      <select className="ww-input" aria-label="Ask which agent" value={to} onChange={(e) => setTo(e.target.value)}>
        {helpers.map((h) => <option key={h.windowId} value={h.windowId}>{h.name}</option>)}
      </select>
      <textarea className="ww-input" rows={3} maxLength={8000} aria-label="What it needs help with" placeholder={`What does ${agent.name} need help with?`} value={task} onChange={(e) => setTask(e.target.value)} />
      {state.error && <div className="ww-error" role="alert">{state.error}</div>}
      <button type="submit" className="ww-btn ww-btn--help" disabled={state.sending || !task.trim()}>{state.sending ? 'Asking…' : 'Please help me'}</button>
    </form>
  );
}

function ThreadRow({ thread, mine, onOpenThread }) {
  return (
    <button type="button" className="ww-thread-row" onClick={() => onOpenThread(thread.id)}>
      <span className="ww-ellipsis"><strong>{mine === 'out' ? `→ ${thread.toLabel}` : `${thread.fromLabel} →`}</strong> {thread.task}</span>
      <span className="ww-faint">{thread.status}</span>
    </button>
  );
}

// One agent up close: its desk and avatar on the left, what it has been
// doing in the middle (or the avatar builder, or its job), and on the right
// the help it asked for and the help it is giving.
export function AgentDetail({ agent, office, onSaveAvatar, onResetAvatar, onSeat, onShowWindow, onOpenThread, onAsk, demo }) {
  const [tab, setTab] = React.useState('activity');
  const asked = office.threads.filter((t) => t.from === agent.windowId);
  const helping = office.threads.filter((t) => t.to === agent.windowId);
  const lines = agent.log.slice(-5).map((e) => (e.kind === 'tool' ? `$ ${e.text}` : e.kind === 'start' ? `> ${e.text}` : e.text));

  return (
    <div className="ww-detail" data-testid="ww-agent-detail" data-window-id={agent.windowId}>
      <aside className="ww-habitat">
        <div className="ww-habitat-scene">
          <span className="ww-window ww-window--big" aria-hidden="true" />
          <div className="ww-habitat-stand">
            <Avatar avatar={agent.avatar} status={agent.status} px={6} />
            <span className="ww-big-desk" aria-hidden="true">
              <span className="ww-monitor ww-monitor--big"><pre>{lines.join('\n') || 'zz'}</pre></span>
              <span className="ww-mug" />
            </span>
            <span className="ww-nameplate">{agent.name}</span>
          </div>
        </div>
        <div className="ww-tiles">
          <div className="ww-tile"><div className="ww-eyebrow">Energy</div><div className="ww-row"><EnergyBar value={agent.energy} width={60} /><span className="ww-num">{Math.round(agent.energy * 100)}%</span></div></div>
          <div className="ww-tile"><div className="ww-eyebrow">Mood</div><div className="ww-tile-val" data-testid="ww-mood">{agent.mood}</div></div>
          <div className="ww-tile"><div className="ww-eyebrow">Last hour</div><div className="ww-tile-val">{agent.runsLastHour} task{agent.runsLastHour === 1 ? '' : 's'}{agent.errorsLastHour ? `, ${agent.errorsLastHour} error${agent.errorsLastHour === 1 ? '' : 's'}` : ''}</div></div>
          <div className="ww-tile"><div className="ww-eyebrow">Now</div><StatusPill status={agent.status} /></div>
        </div>
        {agent.task && <div className="ww-now" data-testid="ww-now">{agent.tool ? `Using ${agent.tool}` : agent.task}</div>}
      </aside>

      <section className="ww-detail-main">
        <div className="ww-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className="ww-tab" data-testid={`ww-tab-${id}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        {tab === 'activity' && (
          <div className="ww-activity" data-testid="ww-activity">
            {agent.log.length === 0 && helping.length === 0 && <div className="ww-faint">Nothing yet. Activity shows up here as soon as {agent.name} works on something.</div>}
            {[...agent.log].reverse().map((e, i) => (
              <div className="ww-feed-row" key={`${e.at}-${i}`} data-kind={e.kind}>
                <span className="ww-faint">{when(e.at)}</span>
                <span className="ww-kind">{e.kind === 'start' ? 'picked up' : e.kind === 'tool' ? 'tool' : e.kind}</span>
                <span className="ww-ellipsis">{e.text}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'avatar' && <AvatarBuilder agent={agent} onSave={onSaveAvatar} onReset={onResetAvatar} />}
        {tab === 'job' && (
          <div className="ww-job">
            <label className="ww-field"><span>Department</span>
              <select className="ww-input" data-testid="ww-seat-select" value={agent.deptId} disabled={demo} onChange={(e) => onSeat(agent.windowId, e.target.value)}>
                {office.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
              </select>
            </label>
            <div className="ww-faint">{agent.seatedBy === 'auto' ? 'Placed by its role until someone moves it.' : 'Seated by a teammate.'}</div>
            <dl className="ww-kv">
              <dt>Kind</dt><dd>{KIND_LABEL[agent.kind] || agent.kind}</dd>
              <dt>Role</dt><dd>{agent.role}</dd>
              {agent.model && <><dt>Model</dt><dd>{agent.model}</dd></>}
              <dt>Can do</dt><dd>{agent.abilities.join(', ')}</dd>
            </dl>
            {!demo && <button type="button" className="ww-btn" onClick={() => onShowWindow(agent.windowId)}>Show its window</button>}
          </div>
        )}
      </section>

      <aside className="ww-detail-side">
        <div className="ww-eyebrow">Asked for help</div>
        {asked.length === 0 && <div className="ww-faint">Nobody yet.</div>}
        {asked.slice(0, 6).map((t) => <ThreadRow key={t.id} thread={t} mine="out" onOpenThread={onOpenThread} />)}
        {!demo && <HelpForm agent={agent} office={office} onAsk={onAsk} />}
        <div className="ww-eyebrow">Helping</div>
        {helping.length === 0 && <div className="ww-faint">No requests for {agent.name} yet.</div>}
        {helping.slice(0, 6).map((t) => <ThreadRow key={t.id} thread={t} mine="in" onOpenThread={onOpenThread} />)}
      </aside>
    </div>
  );
}

export function ThreadOverlay({ thread, office, onClose, onShowWindow, demo }) {
  const from = office.agents.find((a) => a.windowId === thread.from);
  const to = office.agents.find((a) => a.windowId === thread.to);
  return (
    <div className="ww-veil" onClick={onClose} role="presentation">
      <div className="ww-thread-card" role="dialog" aria-label={`${thread.fromLabel} and ${thread.toLabel}`} data-testid="ww-thread" onClick={(e) => e.stopPropagation()}>
        <div className="ww-thread-head">
          {from && <Avatar avatar={from.avatar} px={2} />}
          <strong>{thread.fromLabel} ↔ {thread.toLabel}</strong>
          <span className="ww-faint">{thread.status}</span>
          <span className="ww-grow" />
          <button type="button" className="ww-btn" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <div className="ww-thread-body">
          <div className="ww-msg"><span className="ww-msg-bub">{thread.task}</span><span className="ww-faint">{when(thread.createdAt)}</span></div>
          {(thread.result || thread.error) && (
            <div className="ww-msg ww-msg--right"><span className="ww-faint">{when(thread.updatedAt)}</span><span className="ww-msg-bub">{thread.result || thread.error}</span>{to && <Avatar avatar={to.avatar} px={2} />}</div>
          )}
          {!thread.result && !thread.error && <div className="ww-faint">{thread.toLabel} is on it.</div>}
        </div>
        {!demo && <div className="ww-row"><button type="button" className="ww-btn" onClick={() => onShowWindow(thread.id)}>Show the request card</button></div>}
      </div>
    </div>
  );
}
