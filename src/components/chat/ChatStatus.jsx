import React from 'react';
import { Icon } from '../Icons.jsx';
import { describeToolEvent, formatMs } from './toolActivity.js';

const ICONS = {
  Tools: Icon.Tools,
  Files: Icon.Files,
  Folder: Icon.Folder,
  Memory: Icon.Memory,
  Bot: Icon.Bot,
  Send: Icon.Send,
  Search: Icon.Search,
  Calendar: Icon.Calendar,
};

const RECENT_ROWS = 3;

function ActivityIcon({ name, size = 13, ...rest }) {
  const Cmp = ICONS[name] || Icon.Tools;
  return <Cmp size={size} {...rest} />;
}

function DiffChips({ stats }) {
  if (!stats) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700 }}>
      {stats.added > 0 && <span style={{ color: 'var(--accent-ink)' }}>+{stats.added}</span>}
      {stats.removed > 0 && <span style={{ color: 'var(--ink-faint)' }}>−{stats.removed}</span>}
    </span>
  );
}

function CompletedRow({ detail }) {
  const d = describeToolEvent(detail, { past: true });
  const failed = d.ok === false;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: failed ? 'var(--ps-red)' : 'var(--ink-faint)', fontFamily: 'var(--font-mono)', minWidth: 0 }}>
      {failed
        ? <Icon.Close size={10} style={{ color: 'var(--ps-red)', flexShrink: 0 }} data-tool-outcome="failed" />
        : <Icon.Check size={10} style={{ color: 'var(--accent-ink)', flexShrink: 0 }} data-tool-outcome="ok" />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{failed ? `${d.label} — failed` : d.label}</span>
      <DiffChips stats={d.stats} />
      {d.ms !== null && <span style={{ opacity: 0.75, flexShrink: 0 }}>{formatMs(d.ms)}</span>}
    </div>
  );
}

function activeDisplay(liveStatus, recentCount) {
  if (!liveStatus || liveStatus.status === 'thinking' || !liveStatus.detail) {
    return {
      icon: <Icon.Bot size={13} style={{ animation: 'gen-pulse 1.5s infinite ease-in-out' }} />,
      label: recentCount > 0 ? 'Thinking it over' : 'Thinking',
      stats: null,
    };
  }
  const d = describeToolEvent(liveStatus.detail);
  if (liveStatus.status === 'completed_tool') {
    // Between tool rounds — the model is digesting the last result.
    return {
      icon: <Icon.Bot size={13} style={{ animation: 'gen-pulse 1.5s infinite ease-in-out' }} />,
      label: 'Thinking it over',
      stats: null,
    };
  }
  return {
    icon: <ActivityIcon name={d.icon} style={{ animation: 'gen-pulse 1.5s infinite ease-in-out' }} />,
    label: d.label,
    stats: d.stats,
  };
}

export function ChatStatus({ liveStatus, agent, activityLog = [] }) {
  const recent = activityLog.slice(-RECENT_ROWS);
  const hiddenCount = activityLog.length - recent.length;
  const active = activeDisplay(liveStatus, activityLog.length);

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'flex-start' }}>
      <div style={{
        padding: '8px 12px',
        borderRadius: 14,
        background: 'var(--surface-2)',
        border: '1px solid var(--hairline)',
        color: 'var(--ink-soft)',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        maxWidth: '78%',
        minWidth: 0,
      }}>
        {hiddenCount > 0 && (
          <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
            … {hiddenCount} earlier step{hiddenCount === 1 ? '' : 's'}
          </div>
        )}
        {recent.map((detail, i) => <CompletedRow key={`${detail.tool}-${i}`} detail={detail} />)}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
          <span style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-ink)', flexShrink: 0 }}>{active.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 500, transition: 'all 0.2s ease-in-out', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.label}</span>
          <DiffChips stats={active.stats} />
          <span style={{ display: 'inline-flex', gap: 3, opacity: 0.7, flexShrink: 0 }}>
            {[0, 1, 2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', animation: `gen-bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />)}
          </span>
        </div>
      </div>
    </div>
  );
}
