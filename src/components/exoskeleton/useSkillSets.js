import React from 'react';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';

// The Skill sets tab's state: the board's library, which sets this agent
// carries, the selected set (or an unsaved research draft) and its log.
export function useSkillSets(agent) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [library, setLibrary] = React.useState([]);
  const [equippedIds, setEquippedIds] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState('software-engineering');
  const [draft, setDraft] = React.useState(null);
  const [log, setLog] = React.useState([]);
  const [mindsets, setMindsets] = React.useState([]);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');

  const run = async (label, work) => {
    setBusy(label);
    setError('');
    try { return await work(); } catch (err) { setError(err.message || 'That did not work.'); return null; } finally { setBusy(''); }
  };

  const reload = React.useCallback(async () => {
    if (!workspaceId || !agent?.id) return;
    try {
      const [sets, equipped] = await Promise.all([api.getSkillSets(workspaceId), api.getAgentSkillSets(agent.id, workspaceId)]);
      setLibrary(sets.skillSets || []);
      setEquippedIds(equipped.skillSets || []);
    } catch (err) { setError(err.message); }
  }, [agent?.id, workspaceId]);

  React.useEffect(() => { reload(); }, [reload]);

  React.useEffect(() => {
    if (!workspaceId || !selectedId || draft) { setLog([]); setMindsets([]); return undefined; }
    let live = true;
    api.getSkillSetLog(workspaceId, selectedId).then((r) => { if (live) setLog(r.log || []); }).catch(() => { if (live) setLog([]); });
    api.getSkillSet(workspaceId, selectedId).then((r) => { if (live) setMindsets(r.skillSet?.mindsets || []); }).catch(() => { if (live) setMindsets([]); });
    return () => { live = false; };
  }, [workspaceId, selectedId, draft]);

  const selected = draft || library.find((set) => set.id === selectedId) || library[0] || null;

  return {
    workspaceId, library, equippedIds, selected, isDraft: Boolean(draft), log, mindsets, busy, error,
    select: (id) => { setDraft(null); setSelectedId(id); },
    research: (position, model) => run('research', async () => {
      const r = await api.researchSkillSet(workspaceId, position, model);
      setDraft({ ...r.draft, origin: 'research', builtin: false });
    }),
    newBlank: () => setDraft({ name: '', position: '', summary: '', skills: [{ title: '', detail: '' }], benchmark: '', origin: 'manual', builtin: false }),
    save: (set) => run('save', async () => {
      const r = await api.saveSkillSet(workspaceId, draft ? { ...set, id: undefined } : set);
      setDraft(null);
      setSelectedId(r.skillSet.id);
      await reload();
    }),
    remove: (set) => run('remove', async () => {
      await api.deleteSkillSet(workspaceId, set.id);
      if (!set.builtin) setSelectedId('software-engineering');
      await reload();
    }),
    discardDraft: () => setDraft(null),
    toggleEquip: (id) => run('equip', async () => {
      const next = equippedIds.includes(id) ? equippedIds.filter((x) => x !== id) : [...equippedIds, id];
      const r = await api.saveAgentSkillSets(agent.id, next, workspaceId);
      setEquippedIds(r.skillSets || next);
    }),
    addLog: (outcome, note) => run('log', async () => {
      const r = await api.addSkillSetLog(workspaceId, selected.id, outcome, note);
      setLog((rows) => [r.entry, ...rows]);
    }),
    reload,
  };
}
