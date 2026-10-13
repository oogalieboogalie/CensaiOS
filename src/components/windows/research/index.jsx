/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { TavilyKeyPrompt } from '../../leadhound/HuntProgress.jsx';
import { useResearch } from './useResearch.js';
import { SearchPanel } from './SearchPanel.jsx';
import { KnowledgePanel } from './KnowledgePanel.jsx';
import { AskPanel } from './AskPanel.jsx';
import { RecipesPanel } from './RecipesPanel.jsx';
import { compareSheet } from './compareSheet.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { getCollaborationClientId } from '../../../lib/collaboration/clientIdentity.js';

const TABS = [
  { id: 'search', label: 'Search' },
  { id: 'knowledge', label: 'Knowledge base' },
  { id: 'ask', label: 'Ask' },
  { id: 'recipes', label: 'Recipes' },
];

// Tavily Research: search the web, save results to the board's knowledge
// base (fetched in full, chunked, embedded), and ask over it with citations.
export function ResearchWindow({ win = {}, onUpdate }) {
  const research = useResearch({ win, onUpdate });
  const [tab, setTab] = React.useState('search');
  const { status, readOnly, error, kb } = research;
  const needsKey = status.loaded && !status.tavily;
  const spawnAt = useWorkspaceStore((s) => s.spawnAt);
  const beside = () => (Number.isFinite(win.x) ? { x: win.x + (win.w || win.width || 760) + 24, y: win.y || 0 } : null);

  // Compare and price: a board sheet whose Research columns run on open.
  const openCompare = (input) => {
    try {
      const { sheet, title } = compareSheet({ ...input, runBy: getCollaborationClientId() });
      spawnAt('sheets', { title, sheet }, beside(), { w: 980, h: 420 });
      research.clearError();
    } catch (err) {
      research.setError(err.message);
    }
  };
  // Sales leads stay in LeadHound: open it (or bring the board's one forward).
  const openSales = () => {
    const store = useWorkspaceStore.getState();
    const existing = store.wins.find((w) => w.kind === 'leadHound');
    if (existing) store.setActiveId?.(existing.id);
    else spawnAt('leadHound', { title: 'LeadHound' }, beside());
  };

  return (
    <>
      <WindowTitle icon={<Icon.Search size={12} />} label={win.title || 'Research'} subtitle="powered by Tavily" />
      <div className="hb-lh hb-rs" data-readonly={readOnly ? 'true' : undefined}>
        <nav className="hb-rs-tabs" role="tablist" aria-label="Research">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}{t.id === 'knowledge' && kb.length > 0 && <span className="hb-rs-count">{kb.length}</span>}
            </button>
          ))}
          {readOnly && <span className="hb-lh-mono hb-rs-ro">View only</span>}
        </nav>
        {error && <div role="alert" className="hb-lh-alert">{error}</div>}
        {needsKey && tab !== 'knowledge' && <TavilyKeyPrompt who="Research" onSave={research.saveTavilyKey} />}
        {tab === 'search' && <SearchPanel research={research} onAskTab={() => setTab('ask')} />}
        {tab === 'knowledge' && <KnowledgePanel research={research} />}
        {tab === 'ask' && <AskPanel research={research} />}
        {tab === 'recipes' && <RecipesPanel research={research} onCompare={openCompare} onSales={openSales} />}
        <div className="hb-lh-powered hb-lh-mono">Search and extract by Tavily · answers by your own model key</div>
      </div>
    </>
  );
}

export default ResearchWindow;
