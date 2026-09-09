import React from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { Icon } from './Icons.jsx';
import { useGithubConsole } from './github/useGithubConsole.js';
import { RepoSelector } from './github/RepoSelector.jsx';
import { TabHeader } from './github/TabHeader.jsx';
import { GithubPullsList } from './github/GithubPullsList.jsx';
import { GithubIssuesList } from './github/GithubIssuesList.jsx';
import { CreateIssueForm } from './github/CreateIssueForm.jsx';

export function GithubConsoleWindow({ win, onUpdate, currentProject }) {
  const {
    selectedRepo,
    isEditingRepo,
    setIsEditingRepo,
    repoInput,
    setRepoInput,
    activeTab,
    setActiveTab,
    pulls,
    issues,
    loadingPulls,
    loadingIssues,
    error,
    expandedPrNumber,
    expandedIssueNumber,
    prDetails,
    loadingDetails,
    newIssueTitle,
    setNewIssueTitle,
    newIssueBody,
    setNewIssueBody,
    newIssueLabels,
    setNewIssueLabels,
    creatingIssue,
    createIssueResult,
    labelInputs,
    setLabelInputs,
    addingLabel,
    mergingPr,
    mergeOptions,
    setMergeOptions,
    showMergeConfirm,
    setShowMergeConfirm,
    projectRepoOptions,
    handleSelectRepo,
    fetchPulls,
    fetchIssues,
    handleTogglePr,
    handleToggleIssue,
    handleCreateIssue,
    handleAddLabel,
    handleMergePr
  } = useGithubConsole(win, onUpdate, currentProject);

  return (
    <>
      <WindowTitle
        icon={<Icon.Github size={14} />}
        label={win.title || 'GitHub Console'}
        subtitle={selectedRepo ? `Viewing ${selectedRepo}` : 'Select a repository'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(agentId => agentId !== id) })}
      />

      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-ui)',
        fontSize: 13,
      }}>
        <RepoSelector
          selectedRepo={selectedRepo}
          isEditingRepo={isEditingRepo}
          setIsEditingRepo={setIsEditingRepo}
          repoInput={repoInput}
          setRepoInput={setRepoInput}
          projectRepoOptions={projectRepoOptions}
          handleSelectRepo={handleSelectRepo}
          activeTab={activeTab}
          fetchPulls={fetchPulls}
          fetchIssues={fetchIssues}
        />

        {error && error.includes('GITHUB_TOKEN') && (
          <div style={{
            margin: '12px 14px 0',
            padding: '10px 14px',
            borderRadius: 8,
            background: 'color-mix(in oklch, var(--ps-red) 12%, transparent)',
            border: '1px solid color-mix(in oklch, var(--ps-red) 40%, transparent)',
            color: 'var(--ps-red)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            lineHeight: 1.4
          }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon.Alert size={14} /> GITHUB_TOKEN Missing
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              To fetch pull requests and issues, configure a personal token named <code>GITHUB_TOKEN</code> in your <code>.env</code> file.
            </div>
          </div>
        )}

        <TabHeader
          selectedRepo={selectedRepo}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pullsCount={pulls.length}
          issuesCount={issues.length}
        />

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {!selectedRepo ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--ink-soft)', textAlign: 'center', padding: 40 }}>
              <div>
                <Icon.Github size={48} style={{ color: 'var(--ink-faint)', marginBottom: 12 }} />
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Select a Repository</div>
                <p style={{ maxWidth: 320, fontSize: 12, margin: 0 }}>Select a repository above to view its status, issues, and pull requests.</p>
              </div>
            </div>
          ) : error && !error.includes('GITHUB_TOKEN') ? (
            <div style={{ color: 'var(--ps-red)', padding: 12, border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-2)' }}>
              {error}
            </div>
          ) : activeTab === 'pulls' ? (
            <GithubPullsList
              pulls={pulls}
              expandedPrNumber={expandedPrNumber}
              handleTogglePr={handleTogglePr}
              prDetails={prDetails}
              loadingDetails={loadingDetails}
              labelInputs={labelInputs}
              setLabelInputs={setLabelInputs}
              handleAddLabel={handleAddLabel}
              addingLabel={addingLabel}
              showMergeConfirm={showMergeConfirm}
              setShowMergeConfirm={setShowMergeConfirm}
              mergeOptions={mergeOptions}
              setMergeOptions={setMergeOptions}
              handleMergePr={handleMergePr}
              mergingPr={mergingPr}
            />
          ) : activeTab === 'issues' ? (
            <GithubIssuesList
              issues={issues}
              loadingIssues={loadingIssues}
              expandedIssueNumber={expandedIssueNumber}
              handleToggleIssue={handleToggleIssue}
              labelInputs={labelInputs}
              setLabelInputs={setLabelInputs}
              handleAddLabel={handleAddLabel}
              addingLabel={addingLabel}
            />
          ) : activeTab === 'create-issue' ? (
            <CreateIssueForm
              handleCreateIssue={handleCreateIssue}
              createIssueResult={createIssueResult}
              newIssueTitle={newIssueTitle}
              setNewIssueTitle={setNewIssueTitle}
              newIssueBody={newIssueBody}
              setNewIssueBody={setNewIssueBody}
              newIssueLabels={newIssueLabels}
              setNewIssueLabels={setNewIssueLabels}
              creatingIssue={creatingIssue}
            />
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
