import React from 'react';
import { api } from '../../lib/api.js';
import { initialIdeas, cleanIdeaList, ideaSignature } from './ideaUtils.js';
import { useWorkspaceStore } from '../../lib/store.js';

export function useIdea({ win, onUpdate, currentProject }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  // The bullets live on the window and are saved as you type, so two people
  // on one board write them together, letter by letter (see
  // src/lib/collaboration/ideaBulletText.js).
  // Your latest change shows at once and gives way as soon as the board's copy arrives.
  const shared = React.useMemo(() => initialIdeas(win), [win.ideas, win.content]);
  const [mine, setMine] = React.useState({ shared, ideas: null });
  if (mine.shared !== shared) setMine({ shared, ideas: null });
  const ideas = (mine.shared === shared && mine.ideas) || shared;
  const ideasRef = React.useRef(ideas);
  ideasRef.current = ideas;
  const setIdeas = React.useCallback((next) => {
    const list = typeof next === 'function' ? next(ideasRef.current) : next;
    ideasRef.current = list;
    setMine((m) => ({ ...m, ideas: list }));
    onUpdate({ ideas: list, content: list.map(item => `- ${item}`).join('\n') });
  }, [onUpdate]);
  const [draft, setDraft] = React.useState('');
  const [expansion, setExpansion] = React.useState(win.expansion || '');
  const [expandedFromIdeas, setExpandedFromIdeas] = React.useState(() => (
    Array.isArray(win.expandedFromIdeas) ? win.expandedFromIdeas : (win.expansion ? initialIdeas(win) : [])
  ));
  // The save tag lives on the window and is saved as you type, so two people
  // on one board write it together, letter by letter (see shared/collab/textDiff.js).
  const workItem = typeof win.workItem === 'string' ? win.workItem : '';
  const setWorkItem = React.useCallback((next) => onUpdate({ workItem: String(next ?? '') }), [onUpdate]);
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [savedIdea, setSavedIdea] = React.useState(win.savedIdea || null);
  const [assignee, setAssignee] = React.useState(win.ideaAssignee || '');
  const inputRef = React.useRef(null);

  const currentIdeasSignature = React.useMemo(() => ideaSignature(ideas), [ideas]);
  const expansionSignature = React.useMemo(() => ideaSignature(expandedFromIdeas), [expandedFromIdeas]);
  const expansionStale = Boolean(expansion && expansionSignature && currentIdeasSignature !== expansionSignature);

  // Teammates edit the same idea pad: adopt the shared record whenever it
  // changes to something this tab did not write itself.
  const remoteKey = JSON.stringify([
    win.expansion || '', win.expandedFromIdeas || [], win.savedIdea || null, win.ideaAssignee || '',
  ]);
  const lastWrittenKey = React.useRef(remoteKey);
  React.useEffect(() => {
    if (remoteKey === lastWrittenKey.current) return;
    lastWrittenKey.current = remoteKey;
    setExpansion(win.expansion || '');
    setExpandedFromIdeas(Array.isArray(win.expandedFromIdeas) ? win.expandedFromIdeas : []);
    setSavedIdea(win.savedIdea || null);
    setAssignee(win.ideaAssignee || '');
  }, [remoteKey]);

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
        assignee === (win.ideaAssignee || '') &&
        sameSavedIdea
      ) return;
      lastWrittenKey.current = JSON.stringify([expansion, expandedFromIdeas, savedIdea, assignee]);
      onUpdate({
        ideas,
        content,
        expansion,
        expandedFromIdeas,
        savedIdea,
        ideaAssignee: assignee,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [ideas, expansion, expandedFromIdeas, assignee, savedIdea, onUpdate]);

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

    setStatus('Expanding...');
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
        projectPath: currentProject.path,
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
