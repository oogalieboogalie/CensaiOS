import React from 'react';
import { api } from '../../lib/api.js';
import { initialIdeas, cleanIdeaList, ideaSignature } from './ideaUtils.js';
import { useWorkspaceStore } from '../../lib/store.js';

export function useIdea({ win, onUpdate, currentProject }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [ideas, setIdeas] = React.useState(() => initialIdeas(win));
  const [draft, setDraft] = React.useState('');
  const [expansion, setExpansion] = React.useState(win.expansion || '');
  const [expandedFromIdeas, setExpandedFromIdeas] = React.useState(() => (
    Array.isArray(win.expandedFromIdeas) ? win.expandedFromIdeas : (win.expansion ? initialIdeas(win) : [])
  ));
  const [workItem, setWorkItem] = React.useState(win.workItem || '');
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [savedIdea, setSavedIdea] = React.useState(win.savedIdea || null);
  const [assignee, setAssignee] = React.useState(win.ideaAssignee || '');
  const inputRef = React.useRef(null);

  const currentIdeasSignature = React.useMemo(() => ideaSignature(ideas), [ideas]);
  const expansionSignature = React.useMemo(() => ideaSignature(expandedFromIdeas), [expandedFromIdeas]);
  const expansionStale = Boolean(expansion && expansionSignature && currentIdeasSignature !== expansionSignature);

  React.useEffect(() => {
    const t = setTimeout(() => {
      const content = ideas.map(item => `- ${item}`).join('\n');
      const sameIdeas = JSON.stringify(ideas) === JSON.stringify(win.ideas || []);
      const sameSavedIdea = JSON.stringify(savedIdea || null) === JSON.stringify(win.savedIdea || null);
      if (
        sameIdeas &&
        content === (win.content || '') &&
        expansion === (win.expansion || '') &&
        JSON.stringify(expandedFromIdeas) === JSON.stringify(win.expandedFromIdeas || []) &&
        workItem === (win.workItem || '') &&
        assignee === (win.ideaAssignee || '') &&
        sameSavedIdea
      ) return;
      onUpdate({
        ideas,
        content,
        expansion,
        expandedFromIdeas,
        workItem,
        savedIdea,
        ideaAssignee: assignee,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [ideas, expansion, expandedFromIdeas, workItem, assignee, savedIdea, onUpdate]);

  const addIdea = () => {
    const next = draft.trim();
    if (!next) return;
    setIdeas(prev => [...prev, next]);
    setSavedIdea(null);
    setStatus('');
    setDraft('');
    inputRef.current?.focus();
  };

  const removeIdea = (index) => {
    setIdeas(prev => prev.filter((_, i) => i !== index));
    setSavedIdea(null);
    setStatus('');
  };

  const updateIdea = (index, value) => {
    setIdeas(prev => prev.map((item, i) => i === index ? value : item));
    setSavedIdea(null);
    setStatus('');
  };

  const expandIdeas = async () => {
    const cleanIdeas = ideas.map(item => item.trim()).filter(Boolean);
    if (!cleanIdeas.length) {
      setError('Add at least one bullet first.');
      return;
    }

    setStatus('Expanding with Gemini 2.5 Flash...');
    setError('');
    try {
      const res = await fetch('/api/ideas/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: win.title || 'Idea Pad', workspaceId,
          ideas: cleanIdeas,
          project: currentProject || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to expand idea');
      setExpansion(payload.text || '');
      setExpandedFromIdeas(cleanIdeas);
      setSavedIdea(null);
      setStatus(payload.model ? `Expanded with ${payload.model}` : 'Expanded');
    } catch (err) {
      setError(err.message || 'Failed to expand idea');
      setStatus('');
    }
  };

  const clearExpansion = () => {
    setExpansion('');
    setExpandedFromIdeas([]);
    setStatus('');
    setError('');
    setSavedIdea(null);
  };

  const startFresh = () => {
    setIdeas([]);
    setDraft('');
    setExpansion('');
    setExpandedFromIdeas([]);
    setWorkItem('');
    setStatus('');
    setError('');
    setSavedIdea(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const saveToProject = async () => {
    const cleanIdeas = cleanIdeaList(ideas);
    const cleanWorkItem = workItem.trim();
    const expansionForSave = expansionStale ? '' : expansion;

    if (!currentProject?.path) {
      setError('Open a local project before saving this idea.');
      return;
    }

    if (!cleanWorkItem) {
      setError('Add a work item label first, like "Website Update".');
      return;
    }

    if (!cleanIdeas.length && !expansionForSave.trim()) {
      setError('Add bullets or an expansion before saving.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await api.saveProjectIdea({
        workspaceId,
        projectName: currentProject.name,
        workItem: cleanWorkItem,
        ideas: cleanIdeas,
        expansion: expansionForSave,
        sourceTitle: win.title || 'Idea Pad',
        assignee: assignee || null,
        priority: assignee ? 'high' : 'normal',
      });
      setSavedIdea(saved);
      setIdeas([]);
      setDraft('');
      setExpansion('');
      setExpandedFromIdeas([]);
      setWorkItem('');
      return saved;
    } catch (err) {
      setError(err.message || 'Failed to save idea');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return {
    ideas,
    draft,
    setDraft,
    expansion,
    expansionStale,
    workItem,
    setWorkItem,
    status,
    setStatus,
    error,
    setError,
    saving,
    savedIdea,
    assignee,
    setAssignee,
    inputRef,
    addIdea,
    removeIdea,
    updateIdea,
    expandIdeas,
    clearExpansion,
    startFresh,
    saveToProject,
  };
}
