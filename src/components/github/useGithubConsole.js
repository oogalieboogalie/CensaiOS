import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../lib/api.js';
import { logFailure } from '../../lib/appLog/browserLog.js';

export function useGithubConsole(win, onUpdate, currentProject) {
  const [projects, setProjects] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(win.state?.repo || currentProject?.repo || '');
  const [repoInput, setRepoInput] = useState('');
  const [isEditingRepo, setIsEditingRepo] = useState(!selectedRepo);
  const [activeTab, setActiveTab] = useState('pulls');

  const [issues, setIssues] = useState([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [error, setError] = useState(null);

  const [expandedIssueNumber, setExpandedIssueNumber] = useState(null);

  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueBody, setNewIssueBody] = useState('');
  const [newIssueLabels, setNewIssueLabels] = useState('');
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [createIssueResult, setCreateIssueResult] = useState(null);

  const [labelInputs, setLabelInputs] = useState({});
  const [addingLabel, setAddingLabel] = useState({});

  useEffect(() => {
    let cancelled = false;
    api.getProjects()
      .then((list) => {
        if (!cancelled) setProjects(Array.isArray(list) ? list : []);
      })
      .catch((err) => logFailure('github: could not load projects', err, 'github', 'error'));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (currentProject?.repo && !win.state?.repo) {
      setSelectedRepo(currentProject.repo);
      setIsEditingRepo(false);
    }
  }, [currentProject?.repo, win.state?.repo]);

  const handleSelectRepo = (repoName) => {
    const trimmed = repoName.trim();
    setSelectedRepo(trimmed);
    setIsEditingRepo(false);
    onUpdate?.({ state: { ...win.state, repo: trimmed } });
    setError(null);
    setIssues([]);
    setExpandedIssueNumber(null);
  };

  const fetchIssues = useCallback(async () => {
    if (!selectedRepo) return;
    setLoadingIssues(true);
    setError(null);
    try {
      const data = await api.listGithubIssues(selectedRepo, 'open');
      setIssues(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load issues');
    } finally {
      setLoadingIssues(false);
    }
  }, [selectedRepo]);

  useEffect(() => {
    if (selectedRepo) {
      if (activeTab === 'issues') fetchIssues();
    }
  }, [selectedRepo, activeTab, fetchIssues]);

  const handleToggleIssue = (number) => {
    setExpandedIssueNumber(expandedIssueNumber === number ? null : number);
  };

  const handleCreateIssue = async (e) => {
    e.preventDefault();
    if (!selectedRepo || !newIssueTitle.trim()) return;
    setCreatingIssue(true);
    setCreateIssueResult(null);
    setError(null);
    try {
      const labelsArray = newIssueLabels
        ? newIssueLabels.split(',').map(l => l.trim()).filter(Boolean)
        : [];
      const res = await api.createGithubIssue(selectedRepo, newIssueTitle, newIssueBody, labelsArray);
      setCreateIssueResult({ number: res.issueNumber, url: res.url });
      setNewIssueTitle('');
      setNewIssueBody('');
      setNewIssueLabels('');
      fetchIssues();
    } catch (err) {
      setError(err.message || 'Failed to create issue');
    } finally {
      setCreatingIssue(false);
    }
  };

  const handleAddLabel = async (number) => {
    const labelText = labelInputs[number]?.trim();
    if (!selectedRepo || !labelText) return;
    setAddingLabel(prev => ({ ...prev, [number]: true }));
    try {
      const updatedLabels = await api.addGithubLabels(selectedRepo, number, [labelText]);
      setIssues(prev => prev.map(i => i.number === number ? { ...i, labels: updatedLabels } : i));
      setLabelInputs(prev => ({ ...prev, [number]: '' }));
    } catch (err) {
      logFailure('github: could not add a label', err, 'github', 'error');
      alert(err.message || 'Failed to add label');
    } finally {
      setAddingLabel(prev => ({ ...prev, [number]: false }));
    }
  };

  const projectRepoOptions = useMemo(() => {
    const seen = new Set();
    const list = [];
    if (currentProject?.repo) {
      seen.add(currentProject.repo);
      list.push({ repo: currentProject.repo, name: currentProject.name });
    }
    projects.forEach(p => {
      if (p.repo && !seen.has(p.repo)) {
        seen.add(p.repo);
        list.push({ repo: p.repo, name: p.name });
      }
    });
    return list;
  }, [projects, currentProject]);

  return {
    selectedRepo,
    isEditingRepo,
    setIsEditingRepo,
    repoInput,
    setRepoInput,
    activeTab,
    setActiveTab,
    issues,
    loadingIssues,
    error,
    expandedIssueNumber,
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
    projectRepoOptions,
    handleSelectRepo,
    fetchIssues,
    handleToggleIssue,
    handleCreateIssue,
    handleAddLabel,
  };
}
