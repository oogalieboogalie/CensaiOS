/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// One row of the Agent list: the agent's face with a presence dot, its name,
// and a small line with where it runs and what it is doing, and for how long.
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { AgentAvatar } from '../../Agents.jsx';
import { PRESENCE_LABEL, elapsed } from '../../../lib/agentList/presence.js';

const HOST_ICON = { local: Icon.Computer, cloud: Icon.Cloud, browser: Icon.OpenWindow, remote: Icon.Server, web: Icon.Globe, default: Icon.Bot };
const KIND_ICON = { agentConsole: Icon.Terminal, module: Icon.Cube, research: Icon.Search, leadHound: Icon.Flame };

export function HostIcon({ host, size = 11 }) {
  const Glyph = HOST_ICON[host?.id] || Icon.Computer;
  return <span className="al-host" title={host?.label} aria-label={host?.label} role="img"><Glyph size={size} /></span>;
}

export function AgentFace({ row, size = 32 }) {
  const label = PRESENCE_LABEL[row.status];
  let face;
  if (row.agent) face = <AgentAvatar agent={row.agent} size={size} />;
  else {
    const Glyph = KIND_ICON[row.kind] || (row.type === 'network' ? Icon.Globe : Icon.Bot);
    face = <span className="al-tile" style={{ width: size, height: size }}><Glyph size={Math.round(size * 0.5)} /></span>;
  }
  return (
    <span className="al-face" data-status={row.status}>
      {face}
      <span className="al-dot" data-status={row.status} title={label} aria-hidden="true" />
    </span>
  );
}

export function AgentRow({ row, now, selected, onOpen }) {
  const since = elapsed(row.since, now);
  return (
    <button type="button" className="al-row hb-press" data-testid="agent-list-row" data-status={row.status} data-key={row.key}
      aria-pressed={selected} aria-label={`${row.name}, ${PRESENCE_LABEL[row.status]}: ${row.line}`}
      onClick={() => onOpen(row)}>
      <AgentFace row={row} />
      <span className="al-row-text">
        <span className="al-name">{row.name}</span>
        <span className="al-line">
          <HostIcon host={row.host} />
          <span className="al-doing">{row.line}</span>
          {since && <span className="al-since">{since}</span>}
        </span>
      </span>
    </button>
  );
}

export function GroupHeader({ group, open, onToggle }) {
  return (
    <button type="button" className="al-group" aria-expanded={open} data-testid={`agent-list-group-${group.id}`} onClick={onToggle}>
      <Icon.Chevron size={11} style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
      <span>{group.label}</span>
      <span className="al-count">{group.rows.length}</span>
    </button>
  );
}
