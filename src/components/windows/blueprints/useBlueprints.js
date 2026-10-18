import React from 'react';
import { api } from '../../../lib/api.js';
import { useWorkspaceStore } from '../../../lib/store.js';

// The Blueprints window's state: the board's shelf, the shelf tab, the
// selected blueprint (or a draft being written), the last "Do we have ..."
// answer, and the board's phrase list.
export function useBlueprints() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [blueprints, setBlueprints] = React.useState([]);
  const [shelf, setShelf] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState('');
  const [draft, setDraft] = React.useState(null);
  const [answer, setAnswer] = React.useState(null);
  const [phrases, setPhrases] = React.useState([]);
  const [defaults, setDefaults] = React.useState([]);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');

  const run = async (label, work) => {
    setBusy(label);
    setError('');
    try { return await work(); } catch (err) { setError(err.message || 'That did not work.'); return null; } finally { setBusy(''); }
  };

  const reload = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [list, words] = await Promise.all([api.getBlueprints(workspaceId), api.getBlueprintPhrases(workspaceId)]);
      setBlueprints(list.blueprints || []);
      setPhrases(words.phrases || []);
      setDefaults(words.defaults || []);
    } catch (err) { setError(err.message); }
  }, [workspaceId]);

  React.useEffect(() => { reload(); }, [reload]);

  const ask = (question) => run('ask', async () => {
    if (!String(question || '').trim()) { setAnswer(null); return; }
    const result = await api.askBlueprints(workspaceId, question);
    setAnswer({ question, ...result });
    setDraft(null);
    if (result.matches?.[0]) setSelectedId(result.matches[0].id);
  });

  const save = (blueprint) => run('save', async () => {
    const { blueprint: saved } = await api.saveBlueprint(workspaceId, blueprint);
    setDraft(null);
    setSelectedId(saved.id);
    await reload();
    return saved;
  });

  const remove = (id) => run('delete', async () => {
    await api.deleteBlueprint(workspaceId, id);
    setSelectedId('');
    setAnswer(null);
    await reload();
  });

  const savePhrases = (list) => run('phrases', async () => {
    const result = await api.saveBlueprintPhrases(workspaceId, list);
    setPhrases(result.phrases || []);
  });

  const shown = answer ? answer.matches || [] : blueprints.filter((b) => !shelf || b.shelf === shelf);
  const selected = blueprints.find((b) => b.id === selectedId) || shown.find((b) => b.id === selectedId) || null;

  return {
    workspaceId, blueprints, shown, shelf, setShelf, selected, setSelectedId, draft, setDraft,
    answer, setAnswer, ask, save, remove, phrases, defaults, savePhrases, busy, error,
  };
}
