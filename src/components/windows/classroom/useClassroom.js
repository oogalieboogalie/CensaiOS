import React from 'react';
import { api } from '../../../lib/api.js';

const POLL_MS = 1500;

/**
 * The classes on this board and, for the running one, the roster the grid
 * draws: each student's board thumbnail, cursor, progress and raised hand.
 * Polled at a low rate; thumbnails are boxes, not pixels, so it stays cheap.
 */
export function useClassroom(workspaceId) {
  const [classes, setClasses] = React.useState(null);
  const [stripe, setStripe] = React.useState(false);
  const [roster, setRoster] = React.useState(null);
  const [error, setError] = React.useState('');
  const [canTeach, setCanTeach] = React.useState(true);
  const active = (classes || []).find((klass) => !klass.endedAt) || null;

  const loadClasses = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const result = await api.listClasses(workspaceId);
      setClasses(result.classes || []);
      setStripe(Boolean(result.stripe));
    } catch (loadError) {
      // A plain member can see the window but only the owner or an admin runs classes.
      if (loadError.status === 403) setCanTeach(false);
      else setError(loadError.message);
      setClasses([]);
    }
  }, [workspaceId]);
  React.useEffect(() => { loadClasses(); }, [loadClasses]);

  const activeId = active?.id || null;
  const loadRoster = React.useCallback(async () => {
    if (!activeId) return;
    try {
      setRoster(await api.getClassRoster(activeId));
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [activeId]);
  React.useEffect(() => {
    if (!activeId) { setRoster(null); return undefined; }
    loadRoster();
    const id = setInterval(loadRoster, POLL_MS);
    return () => clearInterval(id);
  }, [activeId, loadRoster]);

  return { classes, active, stripe, roster, canTeach, error, setError, reloadClasses: loadClasses, reloadRoster: loadRoster };
}
