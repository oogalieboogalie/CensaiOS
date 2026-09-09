import { useState, useEffect } from 'react';
import { addAgent, getAgentById, updateAgent, initializeAgents } from '../../lib/agentStore.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { withTimeout } from '../../lib/appUtils.js';
import { migrateWorkspace } from '../../lib/workspace/allowList.js';
import { resolveWorkspaceProject } from '../../lib/projectPrewarm.js';
import { requestedWorkspaceId } from '../../lib/workspace/shareLink.js';
import { loadSessionWithRetry } from './loadSessionWithRetry.js';

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
        console.error('Failed to get session status', err);
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

      initializeAgents().catch((err) => {
        console.error('Failed to initialize agents from database', err);
      });

      try {
        const [loaded, project] = await Promise.all([
          api.loadWorkspaceAuthoritatively({ workspaceId: requestedWorkspaceId() }),
          withTimeout(api.getCurrentProject(), 1200, 'Current project load').catch(() => null),
        ]);
        if (cancelled) return;
        setWorkspaceLoad(loaded);
        if (loaded.status === 'draft_required') {
          // A newer browser draft exists, but the server copy is intact and
          // usable: boot straight into it and let the UI offer the draft
          // back non-blockingly. The canvas never waits on this choice.
          setWorkspaceRevision(loaded.revision);
          const migrated = migrateWorkspace(loaded.value || {});
          setInitial(migrated);
          setCurrentProject(resolveWorkspaceProject(loaded.value, project));
          return;
        }
        if (loaded.status !== 'ready') return;
        const res = loaded.value;
        setWorkspaceRevision(loaded.revision);
        if (res?.extraAgents?.length) {
          res.extraAgents.forEach((a) => {
            if (!getAgentById(a.id)) {
              addAgent(a);
            } else {
              updateAgent(a);
            }
          });
        }
        // Brief B1 — run the window allow-list migration on the loaded
        // workspace so the rendering layer can gate on the resulting
        // windowAllowList field without re-implementing the back-compat
        // rules. Idempotent: a fresh post-B1 workspace is a no-op.
        const migrated = migrateWorkspace(res || {});
        setInitial(migrated);
        setCurrentProject(resolveWorkspaceProject(res, project));
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load workspace from API', err);
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
