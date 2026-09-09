import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { useIdea } from './idea/useIdea.js';
import { IdeaToolbar } from './idea/IdeaToolbar.jsx';
import { IdeaBulletsSection } from './idea/IdeaBulletsSection.jsx';
import { IdeaExpansionSection } from './idea/IdeaExpansionSection.jsx';

export function IdeaWindow({ win, onUpdate, currentProject }) {
  const {
    ideas,
    draft,
    setDraft,
    expansion,
    expansionStale,
    workItem,
    setWorkItem,
    status,
    setStatus,
    error,
    saving,
    savedIdea,
    assignee,
    setAssignee,
    inputRef,
    addIdea,
    removeIdea,
    updateIdea,
    expandIdeas,
    clearExpansion,
    startFresh,
    saveToProject,
  } = useIdea({ win, onUpdate, currentProject });

  return (
    <>
      <WindowTitle
        accent="var(--ps-blue)"
        icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>}
        label={win.title || 'Idea Pad'}
        subtitle="Capture -> expand"
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      >
        <IdeaToolbar
          expansion={expansion}
          onExpand={expandIdeas}
          onClear={clearExpansion}
          onNew={startFresh}
          onSave={saveToProject}
          saving={saving}
          assignee={assignee}
        />
      </WindowTitle>
      <div style={{ flex: 1, minHeight: 0, padding: 16, background: 'var(--surface-2)' }}>
        <div style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(220px, 0.95fr) minmax(260px, 1.05fr)', gap: 12 }}>
          <IdeaBulletsSection
            ideas={ideas}
            workItem={workItem}
            setWorkItem={setWorkItem}
            assignee={assignee}
            setAssignee={setAssignee}
            draft={draft}
            setDraft={setDraft}
            addIdea={addIdea}
            updateIdea={updateIdea}
            removeIdea={removeIdea}
            inputRef={inputRef}
            currentProject={currentProject}
            setSavedIdea={() => {}} // useIdea handles this internally via setIdeas([]) etc. but we kept the prop in section for clarity
            setStatus={setStatus}
          />
          <IdeaExpansionSection
            expansion={expansion}
            status={status}
            error={error}
            expansionStale={expansionStale}
            savedIdea={savedIdea}
          />
        </div>
      </div>
    </>
  );
}
