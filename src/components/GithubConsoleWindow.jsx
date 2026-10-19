import React from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { Icon } from './Icons.jsx';
import { useGithubConsole } from './github/useGithubConsole.js';
import { useMergeDesk } from './github/useMergeDesk.js';
import { useReviewTeam } from './github/useReviewTeam.js';
import { MergeDesk, ConnectGithub } from './github/MergeDesk.jsx';
import { GithubIssuesList } from './github/GithubIssuesList.jsx';
import { CreateIssueForm } from './github/CreateIssueForm.jsx';

const TABS = [
  { id: 'pulls', label: 'Pull requests' },
  { id: 'issues', label: 'Issues' },
  { id: 'create-issue', label: 'New issue' },
];

function RepoPicker({ value, options, onPick, onCancel }) {
  const [text, setText] = React.useState(value || '');
  return (
    <form className="hb-gh-connect" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onPick(text.trim()); }}>
      <h3>Which repository?</h3>
      <div className="hb-gh-connect-row">
        <input autoFocus spellCheck={false} placeholder="owner/name" value={text} onChange={(e) => setText(e.target.value)} aria-label="Repository" />
        <button type="submit" className="hb-btn" data-primary="true" disabled={!text.trim()}>Open</button>
        {value ? <button type="button" className="hb-btn" onClick={onCancel}>Cancel</button> : null}
      </div>
      {options.length ? (
        <div className="hb-gh-repo-options">
          {options.map((o) => (
            <button key={o.repo} type="button" className="hb-btn" onClick={() => onPick(o.repo)}>{o.repo}</button>
          ))}
        </div>
      ) : null}
    </form>
  );
}

export function GithubConsoleWindow({ win, onUpdate, currentProject }) {
  const gh = useGithubConsole(win, onUpdate, currentProject);
  const desk = useMergeDesk(win, onUpdate, gh.selectedRepo);
  const team = useReviewTeam(gh.selectedRepo);
  const { connection } = desk;
  const showPicker = !gh.selectedRepo || gh.isEditingRepo;
  const showConnect = !showPicker && connection.checked && !connection.connected;

  return (
    <>
      <WindowTitle
        icon={<Icon.Github size={14} />}
        label={win.title || 'GitHub'}
        subtitle={gh.selectedRepo || 'Pick a repository'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(agentId => agentId !== id) })}
        actions={gh.selectedRepo ? [{ id: 'repo', label: 'Change repo', onSelect: () => gh.setIsEditingRepo(true) }] : []}
      />

      <div className="hb-gh">
        {showPicker ? (
          <RepoPicker value={gh.selectedRepo} options={gh.projectRepoOptions} onPick={gh.handleSelectRepo} onCancel={() => gh.setIsEditingRepo(false)} />
        ) : showConnect ? (
          <ConnectGithub onSave={desk.saveToken} />
        ) : (
          <>
            <nav className="hb-gh-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={gh.activeTab === t.id} onClick={() => gh.setActiveTab(t.id)}>
                  {t.label}{t.id === 'pulls' && desk.desk ? <span className="hb-gh-tab-count">{desk.desk.prs.length}</span> : null}
                </button>
              ))}
            </nav>
            {gh.activeTab === 'pulls' ? (
              <MergeDesk desk={desk} team={team} />
            ) : (
              <div className="hb-gh-scroll hb-gh-pad">
                {gh.error ? <p className="hb-gh-error">{gh.error}</p> : null}
                {gh.activeTab === 'issues' ? (
                  <GithubIssuesList
                    issues={gh.issues}
                    loadingIssues={gh.loadingIssues}
                    expandedIssueNumber={gh.expandedIssueNumber}
                    handleToggleIssue={gh.handleToggleIssue}
                    labelInputs={gh.labelInputs}
                    setLabelInputs={gh.setLabelInputs}
                    handleAddLabel={gh.handleAddLabel}
                    addingLabel={gh.addingLabel}
                  />
                ) : (
                  <CreateIssueForm
                    handleCreateIssue={gh.handleCreateIssue}
                    createIssueResult={gh.createIssueResult}
                    newIssueTitle={gh.newIssueTitle}
                    setNewIssueTitle={gh.setNewIssueTitle}
                    newIssueBody={gh.newIssueBody}
                    setNewIssueBody={gh.setNewIssueBody}
                    newIssueLabels={gh.newIssueLabels}
                    setNewIssueLabels={gh.setNewIssueLabels}
                    creatingIssue={gh.creatingIssue}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
