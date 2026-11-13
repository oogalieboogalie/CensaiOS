import React from 'react';
import { Icon } from '../../Icons.jsx';
import { AgentAvatar } from '../../Agents.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { getAgents, subscribe as subscribeAgents } from '../../../lib/agentStore.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { useComms } from './useComms.js';
import { statusLabel } from './voiceLogic.js';
import { windowMeta } from './meta.js';
import './voiceComms.css';

export { windowMeta };

// Comms: a push-to-talk channel. Pick an agent in the roster, hold Space (or
// press and hold the button, or the agent's row), speak, release. The agent
// answers out loud and the exchange is captioned on the stage.

function useAgents() {
  return React.useSyncExternalStore(subscribeAgents, getAgents, getAgents);
}

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function hueStyle(agent) {
  const hue = Number(agent?.hue);
  return Number.isFinite(hue) ? { '--agent-h': hue } : undefined;
}

/** Press-and-hold handlers that keep working when the pointer drifts off. */
function holdHandlers(onDown, onUp) {
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
      onDown();
    },
    onPointerUp: onUp,
    onPointerCancel: onUp,
    onLostPointerCapture: onUp,
  };
}

function Member({ agent, index, selected, live, onHold, onRelease, onPick }) {
  return (
    <button type="button" className="vc-member" data-agent-hue="" style={hueStyle(agent)}
      data-selected={selected} data-live={live || undefined} data-testid={`comms-member-${agent.id}`}
      title={`Hold to talk to ${agent.name}`} onClick={onPick} {...holdHandlers(onHold, onRelease)}>
      <AgentAvatar agent={agent} size={28} />
      <span className="vc-member-text">
        <span className="vc-name">{agent.name}</span>
        <span className="vc-role">{agent.role}</span>
      </span>
      {index < 9 && <kbd className="vc-key">{index + 1}</kbd>}
      <span className="vc-dot" aria-hidden="true" />
    </button>
  );
}

export function VoiceCommsWindow({ win = {}, onUpdate }) {
  const agents = useAgents();
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const comms = useComms({ win, onUpdate, workspaceId, agents });
  const agent = agents.find((a) => a.id === win.agentId) || agents[0];
  const { phase } = comms;
  const busy = phase !== 'idle';
  const { prefetch } = comms;
  // Know how this agent hears and speaks before the first press, so the mic opens at once.
  React.useEffect(() => { if (agent?.id) prefetch(agent.id); }, [agent?.id, prefetch]);

  const pick = (id) => { if (id !== agent?.id) { comms.interrupt(); onUpdate?.({ agentId: id }); } };
  const talkTo = (id) => { pick(id); comms.start(id); };

  const onKeyDown = (e) => {
    if (isTyping(e.target)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && agent) comms.start(agent.id);
    } else if (e.key === 'Escape' && busy) {
      e.stopPropagation();
      comms.interrupt();
    } else if (/^[1-9]$/.test(e.key) && agents[Number(e.key) - 1]) {
      pick(agents[Number(e.key) - 1].id);
    }
  };
  const onKeyUp = (e) => { if (e.code === 'Space') { e.preventDefault(); comms.stop(); } };

  if (!agent) {
    return (
      <>
        <WindowTitle label="Comms" />
        <div className="vc-empty">No agents on this board yet.</div>
      </>
    );
  }

  return (
    <>
      <WindowTitle label="Comms" subtitle={agent.name} />
      <div className="vc" ref={comms.meterRef} tabIndex={0} data-phase={phase} data-agent-hue="" style={hueStyle(agent)}
        data-testid="comms" onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) comms.stop(); }}>
        <div className="vc-roster" role="list" aria-label="Agents">
          <div className="vc-roster-head">Channel</div>
          {agents.map((a, i) => (
            <Member key={a.id} agent={a} index={i} selected={a.id === agent.id}
              live={a.id === agent.id && busy ? phase : null}
              onPick={() => pick(a.id)} onHold={() => talkTo(a.id)} onRelease={comms.stop} />
          ))}
        </div>

        <div className="vc-stage">
          <div className="vc-orb"><AgentAvatar agent={agent} size={72} /></div>
          <div className="vc-agent">{agent.name}</div>
          <div className="vc-status" data-testid="comms-status" aria-live="polite">{statusLabel(phase, agent.name)}</div>

          <div className="vc-captions">
            {comms.heard && <p className="vc-line vc-line--me">{comms.heard}</p>}
            {comms.reply && <p className="vc-line vc-line--agent" data-testid="comms-reply">{comms.reply}</p>}
            {comms.error && <p className="vc-error" role="alert">{comms.error}</p>}
            {!comms.heard && !comms.reply && !comms.error && (
              <p className="vc-hint">Tap an agent to select them. Hold their row to talk straight to them.</p>
            )}
          </div>

          <div className="vc-controls">
            <button type="button" className="vc-icon-btn" data-testid="comms-mute"
              title={win.muted ? 'Replies are silent. Turn the voice on' : 'Replies are read aloud. Mute the voice'}
              aria-pressed={Boolean(win.muted)} onClick={() => onUpdate?.({ muted: !win.muted })}>
              {win.muted ? <Icon.SpeakerOff size={16} /> : <Icon.Speaker size={16} />}
            </button>
            <button type="button" className="vc-ptt" data-testid="comms-ptt"
              {...holdHandlers(() => comms.start(agent.id), comms.stop)}>
              <Icon.Mic size={18} />
              <span>{phase === 'listening' ? 'Release to send' : 'Hold to talk'}</span>
              <kbd className="vc-key vc-key--on-fill">Space</kbd>
            </button>
            <button type="button" className="vc-icon-btn" data-testid="comms-stop" disabled={!busy || phase === 'listening'}
              title="Stop (Esc)" onClick={comms.interrupt}>
              <Icon.Stop size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
