import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../lib/api.js';
import { usePrCiPrefetch } from './usePrCiPrefetch.js';

export function useGithubConsole(win, onUpdate, currentProject) {
  const [projects, setProjects] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(win.state?.repo || currentProject?.repo || '');
  const [repoInput, setRepoInput] = useState('');
  const [isEditingRepo, setIsEditingRepo] = useState(!selectedRepo);
  const [activeTab, setActiveTab] = useState('pulls');

  const [pulls, setPulls] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loadingPulls, setLoadingPulls] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [error, setError] = useState(null);

  const [expandedPrNumber, setExpandedPrNumber] = useState(null);
  const [expandedIssueNumber, setExpandedIssueNumber] = useState(null);
  const [prDetails, setPrDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueBody, setNewIssueBody] = useState('');
  const [newIssueLabels, setNewIssueLabels] = useState('');
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [createIssueResult, setCreateIssueResult] = useState(null);

  const [labelInputs, setLabelInputs] = useState({});
  const [addingLabel, setAddingLabel] = useState({});

  const [mergingPr, setMergingPr] = useState({});
  const [mergeOptions, setMergeOptions] = useState({});
  const [showMergeConfirm, setShowMergeConfirm] = useState({});
  const { prefetchPrCi, resetPrCiPrefetch } = usePrCiPrefetch(selectedRepo, setPrDetails, setMergeOptions);

  useEffect(() => {
    let cancelled = false;
    api.getProjects()
      .then((list) => {
        if (!cancelled) setProjects(Array.isArray(list) ? list : []);
      })
      .catch((err) => console.error('Failed to load projects:', err));
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
    setPulls([]);
    setIssues([]);
    resetPrCiPrefetch();
    setExpandedPrNumber(null);
    setExpandedIssueNumber(null);
  };

  const fetchPulls = useCallback(async () => {
    if (!selectedRepo) return;
    setLoadingPulls(true);
    setError(null);
    try {
      const data = await api.listGithubPulls(selectedRepo, 'open');
      const list = Array.isArray(data) ? data : [];
      setPulls(list);
      void prefetchPrCi(list); // background CI dots + merge gating, no expand needed
    } catch (err) {
      setError(err.message || 'Failed to load pull requests');
    } finally {
      setLoadingPulls(false);
    }
  }, [selectedRepo, prefetchPrCi]);
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

  const fetchPrDetails = useCallback(async (number) => {
    if (!selectedRepo || !number) return;
    setLoadingDetails(true);
    try {
      const details = await api.getGithubPullDetails(selectedRepo, number);
      setPrDetails(prev => ({ ...prev, [number]: details }));
      if (details.pr) {
        setMergeOptions(prev => ({
          ...prev,
          [number]: { commit_title: details.pr.title || '', commit_message: '', merge_method: 'merge' }
        }));
      }
    } catch (err) {
      console.error('Failed to load PR details:', err);
    } finally {
      setLoadingDetails(false);
    }
  }, [selectedRepo]);

  useEffect(() => {
    if (selectedRepo) {
      if (activeTab === 'pulls') fetchPulls();
      else if (activeTab === 'issues') fetchIssues();
    }
  }, [selectedRepo, activeTab, fetchPulls, fetchIssues]);

  const handleTogglePr = (number) => {
    if (expandedPrNumber === number) {
      setExpandedPrNumber(null);
    } else {
      setExpandedPrNumber(number);
      if (!prDetails[number]) fetchPrDetails(number);
    }
  };

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

  const handleAddLabel = async (number, isPr) => {
    const labelText = labelInputs[number]?.trim();
    if (!selectedRepo || !labelText) return;
    setAddingLabel(prev => ({ ...prev, [number]: true }));
    try {
      const updatedLabels = await api.addGithubLabels(selectedRepo, number, [labelText]);
      if (isPr) {
        setPulls(prev => prev.map(p => p.number === number ? { ...p, labels: updatedLabels } : p));
        if (prDetails[number]) {
          setPrDetails(prev => ({
            ...prev,
            [number]: {
              ...prev[number],
              pr: { ...prev[number].pr, labels: updatedLabels }
            }
          }));
        }
      } else {
        setIssues(prev => prev.map(i => i.number === number ? { ...i, labels: updatedLabels } : i));
      }
      setLabelInputs(prev => ({ ...prev, [number]: '' }));
    } catch (err) {
      console.error('Failed to add label:', err);
      alert(err.message || 'Failed to add label');
    } finally {
      setAddingLabel(prev => ({ ...prev, [number]: false }));
    }
  };

  const handleMergePr = async (number) => {
    if (!selectedRepo) return;
    const opts = mergeOptions[number] || { merge_method: 'merge' };
    setMergingPr(prev => ({ ...prev, [number]: true }));
    setError(null);
    try {
      await api.mergeGithubPull(selectedRepo, number, opts);
      setPulls(prev => prev.filter(p => p.number !== number));
      setExpandedPrNumber(null);
      alert('PR Merged successfully!');
    } catch (err) {
      setError(err.message || 'Failed to merge PR');
    } finally {
      setMergingPr(prev => ({ ...prev, [number]: false }));
      setShowMergeConfirm(prev => ({ ...prev, [number]: false }));
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
  };
}
