import React from 'react';
import { getWorkspaceMembers } from '../../lib/api/workspaceMembers.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { logToApp } from '../../lib/appLog/browserLog.js';

/**
 * The other people on this board, for a to-do's Assign menu. Before, the menu
 * offered only you, agents and coding agents, so a to-do could not be handed
 * to a teammate at all. Names only; a failed lookup logs its status, never
 * anyone's name or email.
 */
export function useBoardPeople(me, { load = getWorkspaceMembers } = {}) {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const [people, setPeople] = React.useState([]);
  const meId = me?.id ?? null;

  React.useEffect(() => {
    if (!workspaceId) return undefined;
    let cancelled = false;
    load(workspaceId)
      .then((body) => {
        if (cancelled) return;
        const members = Array.isArray(body?.members) ? body.members : [];
        setPeople(members.filter((m) => m && m.id != null && String(m.id) !== String(meId))
          .map((m) => ({ id: m.id, name: String(m.name || '').trim() || 'Teammate' })));
      })
      .catch((err) => {
        if (!cancelled) logToApp('warn', `todos: could not list the people on this board (status ${err?.status || 'unknown'})`, { where: 'todos' });
      });
    return () => { cancelled = true; };
  }, [workspaceId, meId, load]);

  return people;
}
