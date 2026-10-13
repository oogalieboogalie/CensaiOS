/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ToolCallList } from './ToolCallCard.jsx';

/**
 * The live part of a reply while the agent works (spec 3): finished tool
 * calls as cards, the call in flight as a pulsing card, and a quiet
 * "Thinking" line until text starts streaming.
 */
export function ChatStatus({ liveStatus, activityLog = [], streaming = false }) {
  const running = liveStatus?.status === 'calling_tool' && liveStatus.detail ? liveStatus.detail : null;
  const label = activityLog.length > 0 ? 'Thinking it over' : 'Thinking';
  return (
    <>
      <ToolCallList tools={activityLog} running={running} />
      {!running && !streaming && (
        <div className="hb-thinking" role="status">
          <span>{label}</span>
          <span style={{ display: 'inline-flex', gap: 'var(--space-1)' }} aria-hidden="true">
            {[0, 1, 2].map(i => <span key={i} className="hb-thinking-dot" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </span>
        </div>
      )}
    </>
  );
}
