import React from 'react';
import { Icon } from '../Icons.jsx';
import { schedulerInputStyle, addProjectToggleStyle, addProjectToggleActiveStyle } from './styles.js';

export function SchedulerProjectOptions({ state }) {
  const {
    projectsLoading,
    projectsError,
    projectOptions,
    selectedProjectRef,
    setSelectedProjectRef,
    showAddProject,
    setShowAddProject,
    newProjectMode,
    setNewProjectMode,
    newProjectName,
    setNewProjectName,
    newProjectPath,
    setNewProjectPath,
    newProjectRepo,
    setNewProjectRepo,
    addProjectError,
    addingProject,
    handleAddProjectOption
  } = state;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target Project Context</span>
      {projectsLoading && projectOptions.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Loading projects...</div>
      ) : projectsError && projectOptions.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ps-red)' }}>{projectsError}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={selectedProjectRef}
              onChange={(e) => setSelectedProjectRef(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--hairline)',
                background: 'var(--surface-2)',
                color: 'var(--ink)',
                fontSize: 13,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {projectOptions.map(p => (
                <option key={p.value} value={p.value}>
                  {p.name} {p.caption ? `(${p.caption})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowAddProject(!showAddProject)}
              title="Add Project"
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                background: showAddProject ? 'var(--accent)' : 'var(--surface-2)',
                color: showAddProject ? 'white' : 'var(--ink)',
                border: showAddProject ? '1px solid var(--accent)' : '1px solid var(--hairline)',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon.Plus size={16} />
            </button>
          </div>

          {showAddProject && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              background: 'var(--surface-2)',
              border: '1px solid var(--hairline-strong)',
              borderRadius: 8,
              animation: 'gen-fade 0.2s ease'
            }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => setNewProjectMode('local')}
                  style={newProjectMode === 'local' ? addProjectToggleActiveStyle : addProjectToggleStyle}
                >
                  Local Path
                </button>
                <button
                  type="button"
                  onClick={() => setNewProjectMode('github')}
                  style={newProjectMode === 'github' ? addProjectToggleActiveStyle : addProjectToggleStyle}
                >
                  GitHub Repo
                </button>
              </div>

              <input
                type="text"
                placeholder="Project Name (optional)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                style={schedulerInputStyle}
              />
              {newProjectMode === 'github' ? (
                <input
                  type="text"
                  placeholder="owner/repo"
                  value={newProjectRepo}
                  onChange={(e) => setNewProjectRepo(e.target.value)}
                  style={schedulerInputStyle}
                />
              ) : (
                <input
                  type="text"
                  placeholder="C:\\path\\to\\your\\project"
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                  style={schedulerInputStyle}
                />
              )}
              {addProjectError && <div style={{ fontSize: 10, color: 'var(--ps-red)', lineHeight: 1.35 }}>{addProjectError}</div>}
              <button
                type="button"
                onClick={handleAddProjectOption}
                disabled={addingProject || (newProjectMode === 'github' ? !newProjectRepo.trim() : !newProjectPath.trim())}
                style={{
                  all: 'unset',
                  cursor: addingProject || (newProjectMode === 'github' ? !newProjectRepo.trim() : !newProjectPath.trim()) ? 'not-allowed' : 'pointer',
                  padding: '7px 10px',
                  borderRadius: 7,
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'center',
                  opacity: addingProject || (newProjectMode === 'github' ? !newProjectRepo.trim() : !newProjectPath.trim()) ? 0.55 : 1
                }}
              >
                {addingProject ? 'Adding...' : 'Add to project list'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
