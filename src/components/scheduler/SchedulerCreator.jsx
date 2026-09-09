import React from 'react';
import { Icon } from '../Icons.jsx';
import { SCHEDULER_AGENTS } from './useScheduler.js';
import { schedulerInputStyle, addProjectToggleStyle, addProjectToggleActiveStyle } from './styles.js';

export function SchedulerCreator({ state }) {
  const {
    selectedAgentId, setSelectedAgentId,
    projectOptions, projectsLoading, projectsError,
    selectedProjectRef, setSelectedProjectRef,
    selectedProject,
    showAddProject, setShowAddProject,
    newProjectMode, setNewProjectMode,
    newProjectName, setNewProjectName,
    newProjectPath, setNewProjectPath,
    newProjectRepo, setNewProjectRepo,
    addingProject, addProjectError,
    handleAddProjectOption,
    documentTarget, setDocumentTarget,
    taskText, setTaskText,
    hour, setHour,
    minute, setMinute,
    ampm, setAmpm,
    selectedDate, setSelectedDate,
    repeat, setRepeat,
    repeatDays, setRepeatDays,
    repeatFreq, setRepeatFreq,
    selectedAgentId: agentId,
    githubRepo, setGithubRepo,
    createGithubImmediately, setCreateGithubImmediately,
    submittingGithub, githubStatus,
    agentHue,
    handleAddSchedule,
  } = state;

  return (
    <div style={{ width: '45%', borderRight: '1px solid var(--hairline)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
      <form onSubmit={handleAddSchedule} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Agent Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Agent / Manager</span>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, outline: 'none', appearance: 'none', cursor: 'pointer' }}
            >
              {SCHEDULER_AGENTS.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name} ({agent.role})</option>
              ))}
            </select>
            <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-faint)', fontSize: 10 }}>▼</div>
          </div>
        </div>

        {/* Project Field */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Project</span>
            <button
              type="button"
              onClick={() => { setShowAddProject(prev => !prev); }}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}
            >
              {showAddProject ? 'Close' : 'Add project'}
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedProjectRef}
              onChange={(e) => setSelectedProjectRef(e.target.value)}
              disabled={projectsLoading || projectOptions.length === 0}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, outline: 'none', appearance: 'none', cursor: projectOptions.length ? 'pointer' : 'not-allowed', opacity: projectOptions.length ? 1 : 0.65 }}
            >
              {!projectOptions.length && <option value="">{projectsLoading ? 'Loading projects...' : 'No projects yet'}</option>}
              {projectOptions.map(project => (
                <option key={project.value} value={project.value}>
                  {project.caption ? `${project.name} • ${project.caption}` : project.name}
                </option>
              ))}
            </select>
            <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-faint)', fontSize: 10 }}>▼</div>
          </div>
          {(selectedProject?.caption || projectsError) && (
            <div style={{ fontSize: 10, color: projectsError ? 'var(--ps-red)' : 'var(--ink-faint)', lineHeight: 1.35 }}>
              {projectsError || selectedProject?.caption}
            </div>
          )}
          {showAddProject && (
            <div style={{ border: '1px dashed var(--hairline)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setNewProjectMode('local')} style={newProjectMode === 'local' ? addProjectToggleActiveStyle : addProjectToggleStyle}>Local</button>
                <button type="button" onClick={() => setNewProjectMode('github')} style={newProjectMode === 'github' ? addProjectToggleActiveStyle : addProjectToggleStyle}>GitHub</button>
              </div>
              <input type="text" placeholder="Project name (optional)" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} style={schedulerInputStyle} />
              {newProjectMode === 'github' ? (
                <input type="text" placeholder="owner/repo" value={newProjectRepo} onChange={(e) => setNewProjectRepo(e.target.value)} style={schedulerInputStyle} />
              ) : (
                <input type="text" placeholder="C:\\path\\to\\your\\project" value={newProjectPath} onChange={(e) => setNewProjectPath(e.target.value)} style={schedulerInputStyle} />
              )}
              {addProjectError && <div style={{ fontSize: 10, color: 'var(--ps-red)', lineHeight: 1.35 }}>{addProjectError}</div>}
              <button
                type="button"
                onClick={handleAddProjectOption}
                disabled={addingProject || (newProjectMode === 'github' ? !newProjectRepo.trim() : !newProjectPath.trim())}
                style={{ all: 'unset', cursor: addingProject || (newProjectMode === 'github' ? !newProjectRepo.trim() : !newProjectPath.trim()) ? 'not-allowed' : 'pointer', padding: '7px 10px', borderRadius: 7, background: 'var(--accent)', color: 'white', fontSize: 11, fontWeight: 700, textAlign: 'center', opacity: addingProject || (newProjectMode === 'github' ? !newProjectRepo.trim() : !newProjectPath.trim()) ? 0.55 : 1 }}
              >
                {addingProject ? 'Adding...' : 'Add to project list'}
              </button>
            </div>
          )}
        </div>

        {/* Document Target */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Document Target (optional)</span>
          <input type="text" placeholder="e.g. week-32.md" value={documentTarget} onChange={(e) => setDocumentTarget(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 13, outline: 'none' }} />
        </div>

        {/* Task Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Task Description</span>
          <textarea placeholder="Describe the task for the agent to execute..." value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
        </div>

        {/* Time & Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginTop: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '4px 6px' }}>
              <select value={hour} onChange={(e) => setHour(e.target.value)} style={{ all: 'unset', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', padding: '2px 4px' }}>
                {Array.from({ length: 12 }).map((_, i) => { const val = String(i + 1).padStart(2, '0'); return <option key={val} value={val}>{val}</option>; })}
              </select>
              <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>:</span>
              <select value={minute} onChange={(e) => setMinute(e.target.value)} style={{ all: 'unset', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', padding: '2px 4px' }}>
                {Array.from({ length: 12 }).map((_, i) => { const val = String(i * 5).padStart(2, '0'); return <option key={val} value={val}>{val}</option>; })}
              </select>
              <select value={ampm} onChange={(e) => setAmpm(e.target.value)} style={{ all: 'unset', fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', cursor: 'pointer', padding: '2px 4px', background: 'var(--hairline)', borderRadius: 4 }}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</span>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 12, fontWeight: 500, outline: 'none', cursor: 'pointer' }} />
          </div>
        </div>

        {/* Repeat */}
        <div style={{ border: '1px dashed var(--hairline)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Repeat?</span>
            <button type="button" onClick={() => setRepeat(!repeat)} style={{ all: 'unset', cursor: 'pointer', width: 38, height: 20, borderRadius: 10, background: repeat ? 'var(--accent)' : 'var(--hairline-strong)', position: 'relative', transition: 'background 0.2s ease' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: repeat ? 21 : 3, transition: 'left 0.2s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
            </button>
          </div>
          {repeat && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'gen-fade 0.2s ease' }}>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between', marginTop: 2 }}>
                {Object.keys(repeatDays).map(day => (
                  <button key={day} type="button" onClick={() => setRepeatDays({ ...repeatDays, [day]: !repeatDays[day] })} style={{ all: 'unset', cursor: 'pointer', width: 22, height: 22, borderRadius: '50%', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', textTransform: 'capitalize', background: repeatDays[day] ? 'var(--accent)' : 'var(--surface)', color: repeatDays[day] ? 'white' : 'var(--ink-soft)', border: `1px solid ${repeatDays[day] ? 'var(--accent)' : 'var(--hairline)'}`, boxShadow: 'var(--shadow-card)' }}>
                    {day === 'sat' ? 's' : day.slice(0, 1)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                {['weekly', 'monthly'].map(freq => (
                  <button key={freq} type="button" onClick={() => setRepeatFreq(freq)} style={{ all: 'unset', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: repeatFreq === freq ? 'var(--accent-soft)' : 'var(--surface)', color: repeatFreq === freq ? 'var(--accent-ink)' : 'var(--ink-soft)', border: `1px solid ${repeatFreq === freq ? 'var(--accent)' : 'var(--hairline)'}` }}>{freq}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* GitHub Integration (Jules only) */}
        {agentId === 'jules' && (
          <div style={{ border: '1px solid var(--accent)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: 'oklch(from var(--accent) l c h / 0.05)', animation: 'gen-fade 0.25s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-ink)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>GitHub Issue Integration</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 9.5, color: 'var(--ink-soft)' }}>GitHub Repository (owner/repo)</span>
              <input type="text" placeholder="e.g. alex/nexus-delta" value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 11, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <input type="checkbox" id="chk-github" checked={createGithubImmediately} disabled={!githubRepo} onChange={(e) => setCreateGithubImmediately(e.target.checked)} style={{ cursor: 'pointer' }} />
              <label htmlFor="chk-github" style={{ fontSize: 11, color: githubRepo ? 'var(--ink)' : 'var(--ink-faint)', cursor: githubRepo ? 'pointer' : 'default', userSelect: 'none' }}>Create GitHub Issue immediately</label>
            </div>
            {githubStatus && (
              <div style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, background: githubStatus.type === 'success' ? 'var(--accent-soft)' : githubStatus.type === 'error' ? 'var(--ps-red)22' : 'var(--surface-2)', color: githubStatus.type === 'success' ? 'var(--accent-ink)' : githubStatus.type === 'error' ? 'var(--ps-red)' : 'var(--ink-soft)', border: `1px solid ${githubStatus.type === 'success' ? 'var(--accent)' : githubStatus.type === 'error' ? 'var(--ps-red)' : 'var(--hairline)'}` }}>
                {githubStatus.text}
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!taskText.trim() || submittingGithub}
          style={{ width: '100%', padding: '10px', borderRadius: 8, background: `oklch(0.62 0.14 ${agentHue})`, color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: 'var(--shadow-card)', opacity: taskText.trim() ? 1 : 0.6, transition: 'opacity 0.2s, background 0.2s' }}
        >
          <Icon.Plus size={14} /> Add Scheduled Task
        </button>
      </form>
    </div>
  );
}
