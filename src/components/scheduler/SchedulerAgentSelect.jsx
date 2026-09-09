import React from 'react';
import { SCHEDULER_AGENTS } from './constants.js';

export function SchedulerAgentSelect({ selectedAgentId, setSelectedAgentId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Delegate To</span>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6
      }}>
        {SCHEDULER_AGENTS.map(agent => {
          const isSelected = selectedAgentId === agent.id;
          const hue = agent.hue ?? 145;
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => setSelectedAgentId(agent.id)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '8px 4px',
                borderRadius: 10,
                background: isSelected ? `oklch(0.92 0.04 ${hue})` : 'var(--surface)',
                border: isSelected ? `1px solid oklch(0.62 0.14 ${hue})` : '1px solid var(--hairline)',
                boxShadow: isSelected ? `0 2px 8px oklch(0.62 0.14 ${hue} / 0.15)` : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isSelected ? `oklch(0.62 0.14 ${hue})` : 'var(--surface-3)',
                color: isSelected ? 'white' : 'var(--ink-soft)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 14,
                fontWeight: 800,
                fontFamily: 'var(--font-mono)'
              }}>
                {agent.glyph}
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: isSelected ? 700 : 500,
                color: isSelected ? `oklch(0.42 0.14 ${hue})` : 'var(--ink)'
              }}>
                {agent.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
