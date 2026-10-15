import React from 'react';
import { Icon } from '../Icons.jsx';

export function SchedulerProjectOptions({ state }) {
  const {
    projectsLoading, projectsError, projectOptions,
    selectedProjectRef, setSelectedProjectRef,
    showAddProject, setShowAddProject,
    newProjectMode, setNewProjectMode,
    newProjectName, setNewProjectName,
    newProjectPath, setNewProjectPath,
    newProjectRepo, setNewProjectRepo,
    addProjectError, addingProject, handleAddProjectOption
  } = state;
  const missing = newProjectMode === 'github' ? !newProjectRepo.trim() : !newProjectPath.trim();

  return (
    <div className="hb-sched-field">
      <span className="hb-sched-label">Project</span>
      <div className="hb-sched-inline">
        <select
          className="hb-sched-input"
          aria-label="Project"
          value={selectedProjectRef}
          onChange={(e) => setSelectedProjectRef(e.target.value)}
          disabled={!projectOptions.length}
        >
          {!projectOptions.length && <option value="">{projectsLoading ? 'Loading projects...' : 'No projects yet'}</option>}
          {projectOptions.map(p => (
            <option key={p.value} value={p.value}>{p.caption ? `${p.name} (${p.caption})` : p.name}</option>
          ))}
        </select>
        <button type="button" className="hb-sched-btn" aria-pressed={showAddProject} title="Add a project" onClick={() => setShowAddProject(!showAddProject)}>
          <Icon.Plus size={14} />
        </button>
      </div>
      {projectsError && !projectOptions.length && <p className="hb-sched-error">{projectsError}</p>}
      {showAddProject && (
        <div className="hb-sched-addproject">
          <div className="hb-sched-seg" role="group" aria-label="Where the project lives">
            <button type="button" aria-pressed={newProjectMode === 'local'} onClick={() => setNewProjectMode('local')}>On this computer</button>
            <button type="button" aria-pressed={newProjectMode === 'github'} onClick={() => setNewProjectMode('github')}>On GitHub</button>
          </div>
          <input className="hb-sched-input" type="text" placeholder="Name (optional)" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
          {newProjectMode === 'github' ? (
            <input className="hb-sched-input" type="text" placeholder="owner/repo" value={newProjectRepo} onChange={(e) => setNewProjectRepo(e.target.value)} />
          ) : (
            <input className="hb-sched-input" type="text" placeholder="C:\\path\\to\\your\\project" value={newProjectPath} onChange={(e) => setNewProjectPath(e.target.value)} />
          )}
          {addProjectError && <p className="hb-sched-error">{addProjectError}</p>}
          <button type="button" className="hb-sched-btn" data-primary="true" onClick={handleAddProjectOption} disabled={addingProject || missing}>
            {addingProject ? 'Adding...' : 'Add project'}
          </button>
        </div>
      )}
    </div>
  );
}
