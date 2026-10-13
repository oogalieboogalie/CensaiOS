import React from 'react';

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

  const [hour, setHour] = React.useState('12');
  const [minute, setMinute] = React.useState('45');
  const [ampm, setAmpm] = React.useState('PM');
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().split('T')[0]);

  const [repeat, setRepeat] = React.useState(false);
  const [repeatDays, setRepeatDays] = React.useState({ s: false, m: false, t: false, w: false, th: false, f: false, sat: false });
  const [repeatFreq, setRepeatFreq] = React.useState('weekly');

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
    hour, setHour,
    minute, setMinute,
    ampm, setAmpm,
    selectedDate, setSelectedDate,
    repeat, setRepeat,
    repeatDays, setRepeatDays,
    repeatFreq, setRepeatFreq,
    createGithubImmediately, setCreateGithubImmediately,
    githubRepo, setGithubRepo,
    submittingGithub, setSubmittingGithub,
    githubStatus, setGithubStatus
  };
}
