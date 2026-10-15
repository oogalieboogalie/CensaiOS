import React from 'react';
import { localDay } from '../../lib/schedule/plainWords.js';

/** Starts on the next whole hour, once, so the first preview is never in the past. */
function nextWholeHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return { time: `${String(d.getHours()).padStart(2, '0')}:00`, date: localDay(d), repeat: 'once', days: [d.getDay()] };
}

export function useSchedulerFormState() {
  const [selectedAgentId, setSelectedAgentId] = React.useState('architect');
  const [selectedProjectRef, setSelectedProjectRef] = React.useState('');
  const [taskText, setTaskText] = React.useState('');
  const [documentTarget, setDocumentTarget] = React.useState('');
  const [showAddProject, setShowAddProject] = React.useState(false);
  const [newProjectMode, setNewProjectMode] = React.useState('local');
  const [newProjectName, setNewProjectName] = React.useState('');
  const [newProjectPath, setNewProjectPath] = React.useState('');
  const [newProjectRepo, setNewProjectRepo] = React.useState('');
  const [addingProject, setAddingProject] = React.useState(false);
  const [addProjectError, setAddProjectError] = React.useState('');

  // When it runs, in the shared shape from lib/schedule/plainWords.js.
  const [when, setWhen] = React.useState(nextWholeHour);

  const [createGithubImmediately, setCreateGithubImmediately] = React.useState(false);
  const [githubRepo, setGithubRepo] = React.useState('');
  const [submittingGithub, setSubmittingGithub] = React.useState(false);
  const [githubStatus, setGithubStatus] = React.useState(null);

  return {
    selectedAgentId, setSelectedAgentId,
    selectedProjectRef, setSelectedProjectRef,
    taskText, setTaskText,
    documentTarget, setDocumentTarget,
    showAddProject, setShowAddProject,
    newProjectMode, setNewProjectMode,
    newProjectName, setNewProjectName,
    newProjectPath, setNewProjectPath,
    newProjectRepo, setNewProjectRepo,
    addingProject, setAddingProject,
    addProjectError, setAddProjectError,
    when, setWhen,
    createGithubImmediately, setCreateGithubImmediately,
    githubRepo, setGithubRepo,
    submittingGithub, setSubmittingGithub,
    githubStatus, setGithubStatus
  };
}
