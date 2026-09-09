import React from 'react';
import { Icon } from './Icons.jsx';
import { AgentIcon } from '../lib/agentIcons/sprite.jsx';
import { hasVectorIcon } from '../lib/agentIcons/registry.js';
import { FAMILY_AGENTS, FAMILY_AGENT_SYSTEMS } from '../data/family-agents.js';

export const BUILT_IN_AGENTS = FAMILY_AGENTS;
export const AGENT_SYSTEMS = { ...FAMILY_AGENT_SYSTEMS };

const AGENT_VISUALS = {
  architect: { icon: Icon.NewWorkflow, hue: 12, label: 'A', mark: 'lead' },
  censai: { icon: Icon.Search, hue: 145, label: 'C', mark: 'research' },
  atlas: { icon: Icon.Gear, hue: 220, label: 'A', mark: 'backend' },
  genesis: { icon: Icon.Eye, hue: 305, label: 'G', mark: 'design' },
  nexus: { icon: Icon.Memory, hue: 50, label: 'N', mark: 'data' },
  foundation: { icon: Icon.Plug, hue: 195, label: 'F', mark: 'infra' },
  echo: { icon: Icon.Chat, hue: 80, label: 'E', mark: 'strategy' },
  phoenix: { icon: Icon.Flame, hue: 24, label: 'P', mark: 'recovery' },
};

export function AgentVectorIcon({ id, size }) {
  const strokeWidth = 1.8;
  switch (id) {
    case 'architect':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="9" strokeDasharray="3 3" opacity="0.6" />
          <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="1 3" />
          <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="1 3" />
          <path d="M7 17L12 7L17 17" />
          <line x1="9" y1="13" x2="15" y2="13" />
        </svg>
      );
    case 'censai':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M4 19.5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14.5" />
          <path d="M6 3v18h14" />
          <circle cx="13" cy="10" r="3" />
          <line x1="13" y1="5" x2="13" y2="7" />
          <line x1="13" y1="13" x2="13" y2="15" />
          <line x1="8" y1="10" x2="10" y2="10" />
          <line x1="16" y1="10" x2="18" y2="10" />
        </svg>
      );
    case 'atlas':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 21h18M6 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" />
          <path d="M9 10h6M9 14h6M9 18h6" />
          <path d="M12 2v3" />
        </svg>
      );
    case 'genesis':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4a8 8 0 0 1 8 8" />
          <path d="M12 20a8 8 0 0 1-8-8" />
          <path d="M12 9a3 3 0 0 1 3 3" />
          <path d="M12 15a3 3 0 0 1-3-3" />
        </svg>
      );
    case 'nexus':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <polygon points="12 2 22 8 12 14 2 8 12 2" />
          <polygon points="12 14 22 20 12 26 2 20 12 14" opacity="0.4" />
          <line x1="2" y1="8" x2="2" y2="16" />
          <line x1="12" y1="14" x2="12" y2="22" />
          <line x1="22" y1="8" x2="22" y2="16" />
          <path d="M7 5l5 3 5-3" />
        </svg>
      );
    case 'foundation':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4" />
        </svg>
      );
    case 'echo':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M18 3v18M12 7v10M6 11v2" />
          <path d="M3 12h18" opacity="0.3" />
          <path d="M6 12l6-4 6 4" strokeWidth="2" />
        </svg>
      );
    case 'phoenix':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
  }
}

export function AgentAvatar({ agent, size = 28, ring = false, dragHandle = false }) {
  if (!agent) return null;
  const showBadge = size >= 30;
  const iconSize = Math.max(11, Math.round(size * 0.54));
  const badgeSize = Math.max(12, Math.round(size * 0.34));

  // Theme-matched avatars: one calm identity instead of per-agent rainbow.
  // (Per-agent hues still live on agent.hue for accents elsewhere.)
  const bgStyle = 'var(--accent-soft)';
  const borderStyle = '1px solid var(--hairline-strong)';
  const colorStyle = 'var(--accent-ink)';

  return (
    <div
      title={`${agent.name} — ${agent.role}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(8, Math.round(size * 0.28)),
        position: 'relative',
        isolation: 'isolate',
        background: bgStyle,
        color: colorStyle,
        display: 'grid',
        placeItems: 'center',
        border: borderStyle,
        boxShadow: ring
          ? '0 0 0 2px var(--surface), 0 0 0 3px var(--accent)'
          : 'none',
        cursor: dragHandle ? 'grab' : 'default',
        userSelect: 'none',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 1,
          borderRadius: 'inherit',
          border: '1px solid var(--surface)',
          zIndex: -1,
          opacity: 0.4,
        }}
      />
      {hasVectorIcon(agent)
        ? <AgentIcon agent={agent} size={iconSize} />
        : <AgentVectorIcon id={agent.id} size={iconSize} />}
      {showBadge && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: badgeSize,
            height: badgeSize,
            borderRadius: Math.max(4, Math.round(badgeSize * 0.32)),
            display: 'grid',
            placeItems: 'center',
            background: 'var(--accent-soft)',
            color: 'var(--accent-ink)',
            border: '1px solid var(--hairline-strong)',
            fontSize: Math.max(8, Math.round(size * 0.18)),
            fontWeight: 800,
            lineHeight: 1,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {agent.glyph || 'A'}
        </span>
      )}
    </div>
  );
}

export function agentColor(agent) {
  if (!agent) return 'var(--accent)';
  return `oklch(0.50 0.20 ${agent.hue ?? 145})`;
}
