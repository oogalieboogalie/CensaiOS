import React from 'react';
import { api } from '../../lib/api.js';
import { normalizeTodos } from './TodosData.js';
import { useOperationalTodos } from './useOperationalTodos.js';
import { useWorkspaceStore } from '../../lib/store.js';

export function useTodos(win, onUpdate, currentProject) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const items = React.useMemo(() => normalizeTodos(win.items), [win.items]);
  const operational = useOperationalTodos(win, onUpdate, items);
  const [newText, setNewText] = React.useState('');
  const [handoffError, setHandoffError] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);
  const [editText, setEditText] = React.useState('');
  const pendingHandoffs = React.useRef(new Set());

  const setLocalItems = (next) => onUpdate({ items: normalizeTodos(typeof next === 'function' ? next(items) : next) });
  const updateViewItem = (id, patch) => setLocalItems(items.map(it => it.id === id ? { ...it, ...patch } : it));
  const persistItemPatch = (id, patch) => {
    const next = items.map(it => it.id === id ? { ...it, ...patch } : it);
    if (operational.enabled) return operational.updateItem(next, id, patch);
    setLocalItems(next);
    return Promise.resolve();
  };
  const toggle = (id) => {
    const item = items.find(it => it.id === id);
    if (item) persistItemPatch(id, { done: !item.done });
  };
  const assign = (id, aid) => persistItemPatch(id, { assignee: aid });
  const add = () => {
    const text = newText.trim();
    if (!text) return;
    const item = { id: Date.now(), text, done: false, assignee: null };
    const next = [...items, item];
    if (operational.enabled) operational.addItem(next, item);
    else setLocalItems(next);
    setNewText('');
  };
  
  const startEdit = (id, text) => { setEditingId(id); setEditText(text); };
  const saveEdit = () => { if (editingId && editText.trim()) { persistItemPatch(editingId, { text: editText.trim() }); } setEditingId(null); setEditText(''); };
  const cancelEdit = () => { setEditingId(null); setEditText(''); };
  
  const completedCount = React.useMemo(() => items.filter(it => it.done).length, [items]);
  const totalCount = items.length;

  const handoff = async (item) => {
    const sourceId = `${win.id || win.kind || 'todos'}:${item.id}`;
    if (item.handingOff || pendingHandoffs.current.has(sourceId)) return;
    pendingHandoffs.current.add(sourceId);
    setHandoffError('');
    updateViewItem(item.id, { handingOff: true });
    try {
      if (operational.enabled) {
        const result = await operational.dispatchItem(
          items.map(it => it.id === item.id ? { ...it, handingOff: true } : it),
          item.id
        );
        if (result) {
          window.dispatchEvent(new Event('tasks-updated'));
          return;
        }
      }
      const result = await api.createProjectHandoff({
        workspaceId,
        title: item.text,
        text: item.text,
        assignee: item.assignee || null,
        sourceTitle: win.title || 'Project To-Dos',
        priority: item.priority || 'normal',
        sourceId,
      });
      await persistItemPatch(item.id, {
        handingOff: false,
        handedOffAt: new Date().toISOString(),
        handoffPath: result.relativePath || result.path,
        handoffTaskId: result.task?.id || null,
        handoffWarning: result.taskSkipped || null,
        implementationStatus: result.task?.id ? 'queued' : result.taskSkipped ? 'blocked' : 'dispatched',
        implementationTarget: item.assignee || null,
      });
      window.dispatchEvent(new Event('tasks-updated'));
    } catch (err) {
      updateViewItem(item.id, { handingOff: false });
      setHandoffError(err.message || 'Failed to create handoff');
    } finally {
      pendingHandoffs.current.delete(sourceId);
    }
  };

  return {
    items,
    newText, setNewText,
    handoffError: handoffError || operational.error,
    editingId, editText, setEditText,
    completedCount, totalCount,
    toggle, assign, add, startEdit, saveEdit, cancelEdit, handoff
  };
}
