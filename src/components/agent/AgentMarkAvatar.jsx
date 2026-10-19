import React from 'react';
import { BrandMark } from '../brand/BrandMark.jsx';
import { FAMILY_AGENT_BY_ID } from '../../data/family-agents.js';
import { HostedBadge } from './HostedBadge.jsx';

// Every agent wears the censaiOS Grid mark in a round glass bubble, like
// Censai, with its own colour on the ring and the inside dot. Censai keeps
// Ultem, each family agent has its own token (src/styles/agent-marks.css),
// and agents people made use their own hue through the --agent token.
export function AgentMarkAvatar({ agent, size = 28, ring = false, dragHandle = false }) {
  const family = FAMILY_AGENT_BY_ID[agent.id] ? agent.id : undefined;
  const hue = Number(agent.hue);
  const style = { width: size, height: size, borderWidth: size < 22 ? 1.5 : 2, cursor: dragHandle ? 'grab' : 'default' };
  if (!family && Number.isFinite(hue)) style['--agent-h'] = hue;
  return (
    <span
      className="hb-agent-mark"
      data-agent-hue=""
      data-family-mark={family}
      data-ring={ring ? 'true' : undefined}
      title={`${agent.name} — ${agent.role}`}
      style={style}
    >
      <BrandMark size={Math.round(size * 0.58)} title="" accent="var(--mark)" />
      <HostedBadge agent={agent} size={size} />
    </span>
  );
}
