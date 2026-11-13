import { useState, useEffect } from 'react';
import { applyBoardAgents, refreshAgents } from '../../lib/agentStore.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { withTimeout } from '../../lib/appUtils.js';
import { migrateWorkspace } from '../../lib/workspace/allowList.js';
import { resolveWorkspaceProject } from '../../lib/projectPrewarm.js';
import { requestedWorkspaceId } from '../../lib/workspace/shareLink.js';
import { loadSessionWithRetry } from './loadSessionWithRetry.js';
import { noteBoardLoad } from '../../lib/wakeUp/boardWakeUp.js';
import { logFailure } from '../../lib/appLog/browserLog.js';

/**
 * Owns the boot lifecycle: session check, agent initialization, workspace load,
 * and the project binding. Returns loading flags and the fetched `initial`
 * payload so the consumer can apply it to the store once ready.
 */
export function useAppBootstrap() {
  const [initial, setInitial] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [session, setSession] = useState({ authenticated: false, oauthConfigured: false });
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sessionLoad, setSessionLoad] = useState({ status: 'loading' });
  const [workspaceLoad, setWorkspaceLoad] = useState({ status: 'loading' });
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const setCurrentProject = useWorkspaceStore((s) => s.setCurrentProject);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setSessionChecking(true);
      setSessionLoad({ status: 'loading' });
      setDataLoading(true);
      setIsInitialized(false);

      let currentSess = { authenticated: false, oauthConfigured: false };
      let sessionAvailable = false;
      try {
        currentSess = await loadSessionWithRetry(api.getSession);
        if (cancelled) return;
        sessionAvailable = true;
        setSession(currentSess);
        setSessionLoad({ status: 'ready' });
      } catch (err) {
        if (cancelled) return;
        logFailure('session status not loaded', err, 'startup', 'error');
        setSessionLoad({ status: 'unavailable', error: err });
      } finally {
        if (!cancelled) setSessionChecking(false);
      }

      if (!sessionAvailable) {
        if (!cancelled) setDataLoading(false);
        return;
      }

      if (!currentSess.authenticated) {
        if (!cancelled) setDataLoading(false);
        return;
      }

      // Through refreshAgents, so a teammate's agent change said meanwhile is fetched after this, never before.
      refreshAgents().catch((err) => {
        logFailure('agents not loaded from the database', err, 'startup', 'error');
      });

      try {
        const [loaded, project] = await Promise.all([
          api.loadWorkspaceAuthoritatively({ workspaceId: requestedWorkspaceId() }),
          withTimeout(api.getCurrentProject(), 1200, 'Current project load').catch(() => null),
        ]);
        if (cancelled) return;
        setWorkspaceLoad(loaded);
        noteBoardLoad(loaded, { requestedId: requestedWorkspaceId(), user: currentSess.user });
        // With an unsaved browser draft (draft_required) the server copy is
        // still intact and usable: boot straight into it, the same as any
        // load, and let the UI offer the draft back non-blockingly.
        if (loaded.status !== 'ready' && loaded.status !== 'draft_required') return;
        const res = loaded.value;
        setWorkspaceRevision(loaded.revision);
        // The board's own agents, then each as the server keeps it: a model picked since is kept there.
        if (res?.extraAgents?.length) applyBoardAgents(res.extraAgents);
        // Brief B1 — run the window allow-list migration on the loaded
        // workspace so the rendering layer can gate on the resulting
        // windowAllowList field without re-implementing the back-compat
        // rules. Idempotent: a fresh post-B1 workspace is a no-op.
        const migrated = migrateWorkspace(res || {});
        setInitial(migrated);
        setCurrentProject(resolveWorkspaceProject(res, project));
      } catch (err) {
        if (cancelled) return;
        logFailure('board not loaded from the server', err, 'startup', 'error');
        setWorkspaceLoad({ status: 'unavailable', error: err });
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, setCurrentProject]);

  return {
    initial, dataLoading,
    isInitialized, setIsInitialized, session,
    sessionChecking,
    sessionLoad,
    workspaceLoad,
    workspaceRevision,
    setWorkspaceRevision,
    retryWorkspaceLoad: () => {
      setInitial(null);
      setWorkspaceLoad({ status: 'loading' });
      setLoadAttempt((attempt) => attempt + 1);
    },
  };
}
