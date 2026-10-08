import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { BriefForm } from './leadhound/BriefForm.jsx';
import { HuntProgress, TavilyKeyPrompt } from './leadhound/HuntProgress.jsx';
import { LeadResults } from './leadhound/LeadResults.jsx';
import { useLeadHound } from './leadhound/useLeadHound.js';

// LeadHound: brief → Tavily web search → AI fit scoring → 7-day intro
// sequence + Ice Breaker deliverable for the strongest leads.
export function LeadHoundWindow({ win = {}, onUpdate }) {
  const hound = useLeadHound({ win, onUpdate });
  const { keyStatus, result, running, error } = hound;
  const needsKey = !keyStatus.loading && !keyStatus.configured;

  let body;
  if (running) body = <HuntProgress stepIndex={hound.stepIndex} />;
  else if (result) body = <LeadResults result={result} onBank={hound.bankLead} onReset={hound.reset} />;
  else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 12 }}>
        <BriefForm initial={hound.initialBrief} running={running} onSubmit={hound.hunt} />
        {needsKey && <TavilyKeyPrompt onSave={hound.saveTavilyKey} />}
      </div>
    );
  }

  return (
    <>
      <WindowTitle icon={<Icon.Search size={12} />} label={win.title || 'LeadHound'} subtitle="powered by Tavily" />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface-2)' }}>
        {error && (
          <div role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--ps-red)', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '6px 10px' }}>
            {error}
          </div>
        )}
        {body}
      </div>
    </>
  );
}

export default LeadHoundWindow;
