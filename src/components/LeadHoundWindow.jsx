import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { BriefForm } from './leadhound/BriefForm.jsx';
import { HuntProgress, TavilyKeyPrompt } from './leadhound/HuntProgress.jsx';
import { LeadResults } from './leadhound/LeadResults.jsx';
import { KEY_ERROR_CODES, useLeadHound } from './leadhound/useLeadHound.js';
import { leadToMarkdown, slugify } from './leadhound/exportLead.js';
import { useWorkspaceStore } from '../lib/store.js';

const AGENT_HUNT_LIMIT_MS = 5 * 60 * 1000;

// LeadHound: brief → Tavily web search → AI fit scoring → 7-day intro
// sequence + Ice Breaker deliverable for the strongest leads.
export function LeadHoundWindow({ win = {}, onUpdate }) {
  const hound = useLeadHound({ win, onUpdate });
  const spawnAt = useWorkspaceStore((s) => s.spawnAt);
  const { keyStatus, result, running, error, errorCode } = hound;
  const [changingKey, setChangingKey] = React.useState(false);
  const needsKey = !keyStatus.loading && (!keyStatus.configured || KEY_ERROR_CODES.has(errorCode) || changingKey);
  const [pendingBrief, setPendingBrief] = React.useState(null);

  const saveKey = async (apiKey) => {
    await hound.saveTavilyKey(apiKey);
    setChangingKey(false);
  };

  const hunt = (brief) => {
    setPendingBrief(brief);
    hound.hunt(brief);
  };

  // The outreach opens as a Document window just right of this one, tall
  // enough to read the whole plan without scrolling a postage stamp.
  const openDoc = (lead) => {
    const pos = Number.isFinite(win.x) ? { x: win.x + (win.width || win.w || 820) + 24, y: win.y || 0 } : null;
    spawnAt('doc', {
      title: `${lead.company} outreach`,
      fileName: `${slugify(lead.company)}-outreach.md`,
      text: leadToMarkdown(lead, result?.brief),
    }, pos, { w: 640, h: Math.max(560, win.h || 0) });
  };

  // Another agent asked LeadHound for leads; its hunt runs elsewhere.
  const agentHunt = win.leadHound?.hunting && Date.now() - (win.leadHound.huntingSince || 0) < AGENT_HUNT_LIMIT_MS;

  let body;
  if (running) body = <HuntProgress progress={hound.progress} brief={pendingBrief} />;
  else if (agentHunt) body = <HuntProgress brief={win.leadHound.brief} note="Another agent on the board asked for these leads." />;
  else if (result) {
    body = (
      <LeadResults
        result={result}
        onBank={hound.bankLead}
        onReset={hound.reset}
        onEditLead={hound.updateLead}
        onOpenDoc={openDoc}
      />
    );
  } else {
    body = (
      <>
        <BriefForm initial={pendingBrief || hound.initialBrief} running={running} onSubmit={hunt} />
        <div className="hb-lh-brief-foot">
          {needsKey && <TavilyKeyPrompt replacing={keyStatus.configured} onSave={saveKey} />}
          <div className="hb-lh-powered hb-lh-mono">
            Search by Tavily · drafts by your own model key
            {keyStatus.configured && !needsKey && (
              <button type="button" className="hb-lh-link-button" onClick={() => setChangingKey(true)}>Change Tavily key</button>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <WindowTitle icon={<Icon.Search size={12} />} label={win.title || 'LeadHound'} subtitle="powered by Tavily" />
      <div className="hb-lh">
        {error && <div role="alert" className="hb-lh-alert">{error}</div>}
        {body}
      </div>
    </>
  );
}

export default LeadHoundWindow;
