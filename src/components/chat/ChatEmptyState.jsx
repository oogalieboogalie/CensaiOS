/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { AgentAvatar } from '../Agents.jsx';
import { Icon } from '../Icons.jsx';
import { agentPersona, agentHueStyle } from '../../lib/chat/persona.js';

/**
 * What a new chat shows (spec 3): who you're talking to, what they're good
 * at, and three starter prompts. Group chats pass several `agents` and their
 * own `title`/`blurb`/`starters`.
 */
export function ChatEmptyState({ agent, agents, title, blurb, starters, model, onPick }) {
  const persona = agent ? agentPersona(agent) : null;
  const heading = title || persona?.name || 'New chat';
  const line = blurb || persona?.blurb || '';
  const prompts = (starters || persona?.starters || []).slice(0, 3);
  const faces = agents?.length ? agents : (agent ? [agent] : []);
  return (
    <div className="hb-chat-empty" data-testid="chat-empty-state" data-agent-hue={agent ? '' : undefined} style={agentHueStyle(agent)}>
      {faces.length > 0 && (
        <div className="hb-chat-empty-avatars">
          {faces.slice(0, 6).map(a => <AgentAvatar key={a.id} agent={a} size={faces.length > 1 ? 28 : 36} />)}
        </div>
      )}
      <div>
        <div className="hb-chat-empty-name">{heading}</div>
        {line && <div className="hb-chat-empty-blurb">{line}</div>}
        {model && <div className="hb-chat-empty-model">Answers with {model}</div>}
      </div>
      {prompts.length > 0 && onPick && (
        <div className="hb-starters">
          {prompts.map(p => (
            <button key={p} type="button" className="hb-starter" onClick={() => onPick(p)}>
              <span>{p}</span><Icon.ArrowRight size={13} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
