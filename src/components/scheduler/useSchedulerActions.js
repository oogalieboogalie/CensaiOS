import React from 'react';
import { api } from '../../lib/api.js';
import { buildSchedulerProjectOptions, getSchedulerProjectReference } from '../schedulerProjects.js';

export function useSchedulerActions(data, formState, currentProject, workspaceId) {
  const {
    projects, fetchProjects, schedules, fetchSchedules, setSchedulesError,
  } = data;
  const {
    selectedProjectRef, setSelectedProjectRef,
    newProjectMode, newProjectName, newProjectPath, newProjectRepo,
    setAddingProject, setAddProjectError, setShowAddProject,
    setNewProjectName, setNewProjectPath, setNewProjectRepo, setNewProjectMode,
    taskText, setTaskText, documentTarget, setDocumentTarget,
    hour, minute, ampm, selectedDate, repeat, repeatDays, repeatFreq,
    selectedAgentId
  } = formState;

  const projectOptions = React.useMemo(
    () => buildSchedulerProjectOptions(projects, currentProject),
    [projects, currentProject]
  );

  React.useEffect(() => {
    if (!projectOptions.length) {
      setSelectedProjectRef('');
      return;
    }
    const currentRef = getSchedulerProjectReference(currentProject);
    if (currentRef && projectOptions.some(option => option.value === currentRef)) {
      setSelectedProjectRef(prev => prev || currentRef);
      return;
    }
    setSelectedProjectRef(prev => {
      if (prev && projectOptions.some(option => option.value === prev)) return prev;
      return projectOptions[0]?.value || '';
    });
  }, [currentProject, projectOptions, setSelectedProjectRef]);

  const selectedProject = React.useMemo(
    () => projectOptions.find(option => option.value === selectedProjectRef) || null,
    [projectOptions, selectedProjectRef]
  );

  const handleAddProjectOption = async () => {
    const trimmedName = newProjectName.trim();
    const trimmedPath = newProjectPath.trim();
    const trimmedRepo = newProjectRepo.trim();
    const payload = newProjectMode === 'github'
      ? { name: trimmedName || undefined, repo: trimmedRepo || undefined }
      : { name: trimmedName || undefined, path: trimmedPath || undefined };

    if (newProjectMode === 'github' && !trimmedRepo) return;
    if (newProjectMode === 'local' && !trimmedPath) return;

    setAddingProject(true);
    setAddProjectError('');
    try {
      const project = await api.openProject(payload);
      await fetchProjects();
      const nextRef = getSchedulerProjectReference(project);
      if (nextRef) setSelectedProjectRef(nextRef);
      setShowAddProject(false);
      setNewProjectName('');
      setNewProjectPath('');
      setNewProjectRepo('');
      setNewProjectMode('local');
    } catch (err) {
      setAddProjectError(err.message || 'Failed to add project');
    } finally {
      setAddingProject(false);
    }
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!taskText.trim()) return;

    const timeStr = `${hour}:${minute} ${ampm}`;
    const projectRef = getSchedulerProjectReference(selectedProject);
    const newSchedule = {
      agent_id: selectedAgentId,
      project_id: selectedProject?.id || null,
      project_name: selectedProject?.name || currentProject?.name || 'Censai',
      project_path: selectedProject?.path || null,
      project_repo: selectedProject?.repo || null,
      project_ref: projectRef || null,
      task_text: taskText.trim(),
      document_target: documentTarget.trim() || null,
      scheduled_time: timeStr,
      scheduled_date: selectedDate,
      repeat_enabled: repeat,
      repeat_days: repeat ? repeatDays : null,
      repeat_freq: repeat ? repeatFreq : null,
      status: 'active'
    };

    try {
      setSchedulesError('');
      await api.createSchedule(newSchedule, workspaceId);
      setTaskText('');
      setDocumentTarget('');
      fetchSchedules({ quiet: true });
    } catch (err) {
      setSchedulesError(err.message || 'Failed to create schedule');
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      const s = schedules.find(x => x.id === id);
      if (!s) return;

      const newStatus = s.status === 'inactive' ? 'active' : 'inactive';
      setSchedulesError('');
      await api.updateSchedule(id, { status: newStatus }, workspaceId);
      fetchSchedules({ quiet: true });
    } catch (err) {
      setSchedulesError(err.message || 'Failed to update schedule');
    }
  };

  const handleDeleteSchedule = async (id) => {
    try {
      setSchedulesError('');
      await api.deleteSchedule(id, workspaceId);
      fetchSchedules({ quiet: true });
    } catch (err) {
      setSchedulesError(err.message || 'Failed to delete schedule');
    }
  };

  return { projectOptions, selectedProject, handleAddProjectOption, handleAddSchedule, handleToggleStatus, handleDeleteSchedule };
}
